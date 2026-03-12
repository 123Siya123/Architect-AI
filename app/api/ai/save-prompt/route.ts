import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { agentId, newPrompt } = await req.json();

    if (!agentId || !newPrompt) {
      return NextResponse.json({ error: 'Missing agentId or newPrompt' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'lib', 'ai', 'prompts-v3.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Map editor IDs to constant names in prompts-v3.ts
    const idToConstantMap: Record<string, string> = {
      'research_specialist': 'RESEARCH_SPECIALIST_V3_PROMPT',
      'architect_planning': 'ARCHITECT_PHASE1_PROMPT',
      'architect_dispatch': 'ARCHITECT_PHASE2_PROMPT',
      'inspector': 'INSPECTOR_PROMPT',
      'contractor_structural': 'CONTRACTOR_PROMPT',
      'contractor_interior': 'CONTRACTOR_PROMPT',
      'contractor_facade': 'CONTRACTOR_PROMPT',
    };

    const constantName = idToConstantMap[agentId];
    if (!constantName) {
      return NextResponse.json({ error: 'Unknown agent ID' }, { status: 400 });
    }

    // Regex to find: export const CONSTANT_NAME = `...`;
    // We use a non-greedy match for the content between backticks
    const regex = new RegExp(`(export const ${constantName} = \`)([\\s\\S]*?)(\`;)`, 'g');
    
    // Check if the constant exists
    if (!regex.test(content)) {
      return NextResponse.json({ error: `Constant ${constantName} not found in file` }, { status: 404 });
    }

    // Replace the content
    const updatedContent = content.replace(regex, `$1${newPrompt}$3`);

    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    return NextResponse.json({ success: true, message: `Prompt for ${agentId} updated successfully` });
  } catch (error: any) {
    console.error('Failed to update prompt:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
