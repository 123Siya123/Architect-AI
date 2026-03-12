import type { AIChatRequest, AIChatResponse, PSGProject, PSGNode, PSGOperation, Material } from '@/types';
import { getProviderConfig, type AIProviderConfig } from './key-manager';
import { callProviderNoTools, callProviderWithTools, extractJSON, toolCallToOperation, reloadProjectState, normalizeMessages } from './orchestrator';
import { validateOperation } from '@/lib/psg/validator';
import { applyOperation } from '@/lib/psg/operations';
import { prepare3DNodeTree, generateASCIIFloorPlan, DecisionHistory, prepareProgressChecklist } from './context';
import { classifyComplexity } from './complexity';
import { logAgentStep, clearLogs } from './logger';
import { updateChecklist, type ChecklistItem } from './completion';

// Import new v3 prompts
import {
    ARCHITECT_PHASE1_PROMPT,
    ARCHITECT_PHASE2_PROMPT,
    CONTRACTOR_PROMPT,
    INSPECTOR_PROMPT,
    RESEARCH_SPECIALIST_V3_PROMPT
} from './prompts-v3';

// =============================================================================
// TYPES
// =============================================================================

export interface MasterBuildDocument {
    target: string;
    tier: string;
    totalFootprint: { x: number; z: number };
    origin: { x: number; y: number; z: number };
    components: Array<{
        id: string;
        name: string;
        type: string;
        position: { x: number; y: number; z: number };
        size: { w: number; h: number; d: number };
        adjacentTo: string[];
        watchItems: string[];
    }>;
    buildOrder: string[];
    completionChecklist: ChecklistItem[];
    materialPalette: Array<{ role: string; materialId: string }>;
    knownRisks: string[];
}

interface ArchitectDecision {
    reasoning_step_1_inspector: string;
    reasoning_step_2_plan: string;
    inspector_decision: 'ACCEPT' | 'FIX' | 'DEFER' | 'OVERRIDE';
    next_contractor: 'Structural Engineer' | 'Facade Artist' | 'Interior Architect' | 'Materials Specialist' | 'Detail Specialist' | 'Master Planner' | 'DESIGN_COMPLETE';
    dispatch_instruction: {
        component_id: string;
        component_spec: string;
        watch_items: string;
    };
}

interface ContractorLog {
    selfAssessment: string;
    coordinatesUsed: string;
    decisionsExplained: string;
    toolsCalled: Array<{ tool: string; args: Record<string, unknown> }>;
}

interface InspectorReport {
    issues: Array<{
        severity: 'CRITICAL' | 'WARNING' | 'INFO';
        description: string;
        affectedNodes: string[];
        recommendation: string;
    }>;
    checklistUpdates: Array<{ id: string; status: 'complete' }>;
    overallScore: number;
    summary: string;
}

type ProgressEvent =
    | { type: 'log'; content: string }
    | { type: 'operation'; operation: PSGOperation; turn: number; agent: string };

// =============================================================================
// MAIN EXECUTION LOOP (V3)
// =============================================================================

export async function sendChatToAI_V3(
    request: AIChatRequest,
    materials: Record<string, Material>,
    onProgress?: (event: ProgressEvent) => void,
    signal?: AbortSignal
): Promise<AIChatResponse> {
    const progressLog: string[] = [];
    const attachments = request.attachments;

    const log = (message: string) => {
        progressLog.push(message);
        console.log(`[Architect V3] ${message}`);
        try {
            onProgress?.({ type: 'log', content: message });
        } catch (e) {}
    };

    const emitOperation = (operation: PSGOperation, turn: number, agent: string) => {
        onProgress?.({ type: 'operation', operation, turn, agent });
    };

    log('🏗️ CONSTRUCTION SITE: Agentic Architecture v3.0 Started');
    
    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    let finalMessage = 'Design completed successfully.';
    const decisionHistory = new DecisionHistory();
    const config = getProviderConfig();

    const complexity = classifyComplexity(request.message);
    const maxCycles = complexity.maxTurns * 2; // Increased cycles for rigorous loop
    const minCycles = complexity.minTurns;

    // Phase 0: Request Classification & Research
    let buildBriefText = 'No Build Brief (Trivial/Standard Tier)';
    if (['COMPLEX', 'LANDMARK', 'MEGA'].includes(complexity.tier)) {
        log('🔬 Phase 0: Research Specialist gathering spatial knowledge...');
        const prompt = RESEARCH_SPECIALIST_V3_PROMPT.replace('{USER_REQUEST}', request.message);
        const researchResult = await callProviderNoTools(config, [{ role: 'user', content: prompt }], undefined, signal);
        const briefObj = extractJSON(researchResult.text);
        if (briefObj) {
            buildBriefText = JSON.stringify(briefObj, null, 2);
            log('✅ Build Brief generated:');
            log(buildBriefText);
            
            logAgentStep({
                phase: 'Research',
                model: config.model,
                response: researchResult.text,
                status: 'success'
            });
        } else {
            log('⚠️ Failed to generate structured Build Brief.');
            log(`Raw Result: ${researchResult.text}`);
        }
    }

    // Phase 1: The Architect Plans (Master Build Document)
    log('🏛️ Phase 1: Architect drafting Master Build Document...');
    const phase1Context = `BUILD BRIEF:\n${buildBriefText}\n\nCURRENT SCENE GRAPH:\n${prepare3DNodeTree(currentProject)}`;
    const prompt1 = ARCHITECT_PHASE1_PROMPT
        .replace('{USER_REQUEST}', request.message)
        .replace('{CONTEXT}', phase1Context);

    const architect1Result = await callProviderNoTools(config, [{ role: 'user', content: prompt1 }], undefined, signal);
    const masterBuildDoc = extractJSON<MasterBuildDocument>(architect1Result.text);
    
    if (!masterBuildDoc) {
        log('❌ Architect failed to produce Master Build Document. Aborting.');
        log(`Raw Result: ${architect1Result.text}`);
        return { message: 'Failed to create Master Build Plan.', operations: [], warnings: [] };
    }
    
    log(`✅ Master Build Document drafted with ${masterBuildDoc.buildOrder.length} steps:`);
    log(JSON.stringify(masterBuildDoc, null, 2));

    logAgentStep({
        phase: 'Planning',
        model: config.model,
        response: architect1Result.text,
        status: 'success'
    });
    let checklistItems = masterBuildDoc.completionChecklist || [];
    let lastInspectorReportText = 'No previous actions. Begin first component.';

    // Phase 2: Contractor Dispatch Loop
    log('🔄 Phase 2: Entering Contractor Dispatch Loop...');
    
    for (let cycle = 1; cycle <= maxCycles; cycle++) {
        log(`\n───── 🔁 CYCLE ${cycle}/${maxCycles} ─────`);

        // Update Checklist
        if (checklistItems.length) {
            checklistItems = updateChecklist(checklistItems, currentProject);
        }

        const sceneGraphJSON = prepare3DNodeTree(currentProject);
        const asciiPlan = generateASCIIFloorPlan(currentProject);
        
        // 1. ARCHITECT DECIDES NEXT STEP
        const phase2Context = `
MASTER BUILD PLAN:
${JSON.stringify(masterBuildDoc, null, 2)}

CURRENT SCENE STATE (JSON + ASCII):
${sceneGraphJSON}
${asciiPlan}

LAST INSPECTOR REPORT:
${lastInspectorReportText}

CHECKLIST STATE:
${JSON.stringify(checklistItems)}
`;

        const prompt2 = ARCHITECT_PHASE2_PROMPT
            .replace('{USER_REQUEST}', request.message)
            .replace('{CONTEXT}', phase2Context);

        log('🏛️ Architect analyzing scene and Inspector report...');
        const architect2Result = await callProviderNoTools(config, [{ role: 'user', content: prompt2 }], undefined, signal);
        
        log('--- ARCHITECT FULL RESPONSE ---');
        log(architect2Result.text);
        log('-------------------------------');

        const architectDecision = extractJSON<ArchitectDecision>(architect2Result.text);

        if (!architectDecision) {
            log('⚠️ Architect failed to return structured JSON. Skipping cycle.');
            continue;
        }

        log(`📋 Decision: ${architectDecision.inspector_decision} -> Delegate to ${architectDecision.next_contractor}`);
        log(`💭 Reasoning Step 1 (Inspector): ${architectDecision.reasoning_step_1_inspector}`);
        log(`💭 Reasoning Step 2 (Plan): ${architectDecision.reasoning_step_2_plan}`);

        logAgentStep({
            phase: `Cycle ${cycle}: Architect Decision`,
            model: config.model,
            response: architect2Result.text,
            status: 'success'
        });

        if (architectDecision.next_contractor === 'DESIGN_COMPLETE' || !architectDecision.dispatch_instruction) {
            // Evaluated Completion Gates before exit
            const score = 100; // Simplified for now
            const completedRatio = checklistItems.filter(c => c.complete).length / (checklistItems.length || 1);
            if (completedRatio === 1 || architectDecision.inspector_decision === 'OVERRIDE') {
                log('✨ All completion gates passed. Exiting loop.');
                break;
            } else {
                log('⚠️ Architect attempted to exit, but checklist incomplete. Continuing.');
                continue;
            }
        }

        // 2. DISPATCH CONTRACTOR
        const contractorName = architectDecision.next_contractor;
        log(`🔧 Dispatching ${contractorName}...`);

        const contractorPrompt = CONTRACTOR_PROMPT
            .replace('{ROLE}', contractorName)
            .replace('{COMPONENT_SPEC}', JSON.stringify(architectDecision.dispatch_instruction, null, 2))
            .replace('{SCENE_STATE}', sceneGraphJSON)
            .replace('{TOOLS_REFERENCE}', 'Use add_node, move_node, set_node_position, resize_node, delete_node appropriately.');

        const contractorResult = await callProviderWithTools(config, [{ role: 'user', content: contractorPrompt }], attachments, signal);
        
        log(`--- ${contractorName.toUpperCase()} FULL RESPONSE ---`);
        log(contractorResult.text);
        log('--------------------------------------------------');

        // Process Contractor Tools
        let contractorActivity = 'Contractor reasoning: ' + contractorResult.text;

        logAgentStep({
            phase: `Cycle ${cycle}: Contractor - ${contractorName}`,
            model: config.model,
            response: contractorResult.text,
            toolCalls: contractorResult.toolCalls,
            status: 'success'
        });
        
        if (contractorResult.toolCalls && contractorResult.toolCalls.length > 0) {
            log(`   🛠️ ${contractorName} issued ${contractorResult.toolCalls.length} tools.`);
            for (const tc of contractorResult.toolCalls) {
                try {
                    const op = toolCallToOperation(tc.name, tc.args);
                    const validation = validateOperation(op, currentProject);
                    if (validation.valid) {
                        const applied = applyOperation(currentProject, op);
                        if (applied.project) {
                            currentProject = applied.project;
                            const finalOp = { ...op, target_id: applied.nodeId || op.target_id };
                            allValidatedOps.push(finalOp);
                            emitOperation(finalOp, cycle, contractorName);
                        }
                    } else {
                        log(`   ❌ Invalid Tool Call (${tc.name}): ${validation.errors?.join(', ')}`);
                    }
                } catch (e) {
                    log(`   ❌ Tool Call Failed: ${(e as Error).message}`);
                }
            }
        } else {
            log(`   ⚠️ ${contractorName} did not call any tools.`);
        }

        // 3. INSPECTOR REVIEWS
        log('🔍 Inspector analyzing new scene state...');
        const newSceneState = prepare3DNodeTree(currentProject);
        const inspectorPrompt = INSPECTOR_PROMPT
            .replace('{SCENE_STATE}', newSceneState)
            .replace('{COMPONENT_SPEC}', JSON.stringify(architectDecision.dispatch_instruction))
            .replace('{CHECKLIST_STATE}', JSON.stringify(checklistItems))
            .replace('{CODE_HINTS}', 'No active code hints.');

        const inspectorResult = await callProviderNoTools(config, [{ role: 'user', content: inspectorPrompt }], undefined, signal);
        
        log('--- INSPECTOR FULL RESPONSE ---');
        log(inspectorResult.text);
        log('-------------------------------');

        const inspectorReport = extractJSON<InspectorReport>(inspectorResult.text);

        if (inspectorReport) {
            lastInspectorReportText = JSON.stringify(inspectorReport, null, 2);
            const severityCounts = inspectorReport.issues.reduce((acc, issue) => { acc[issue.severity] = (acc[issue.severity] || 0) + 1; return acc; }, {} as Record<string, number>);
            log(`   📝 Inspector Score: ${inspectorReport.overallScore}. Issues: ${severityCounts.CRITICAL || 0} CRITICAL, ${severityCounts.WARNING || 0} WARNING.`);
            
            logAgentStep({
                phase: `Cycle ${cycle}: Inspector Report`,
                model: config.model,
                response: inspectorResult.text,
                status: 'success'
            });
        } else {
            lastInspectorReportText = 'Inspector failed to generate report format. Proceeding with caution.';
            log('⚠️ Inspector failed to produce structured report.');
        }
    }

    log('✅ Processing Design Finale...');
    
    // Save state
    await reloadProjectState(currentProject.id, currentProject);

    return {
        message: finalMessage + '\n\n' + progressLog.join('\n'),
        operations: allValidatedOps,
        warnings: [],
    };
}
