# Wall Surface Matrix Protocol

`edit_wall_surface` controls wall thickness as a scalar field.

- Low value = thin wall
- High value = thick wall
- Value `<= hole_threshold` = void/opening

## Data Model

Each wall/partition may store:

- `surface_matrix.code`: procedural formula using `u` and `v`
- `surface_matrix.data`: matrix of explicit thickness values
- `surface_matrix.rows`, `surface_matrix.cols`
- `surface_matrix.min_value`, `surface_matrix.max_value`
- `surface_matrix.hole_threshold`
- `surface_matrix.interpolation` (`nearest` or `bilinear`)

## Coordinate System

- `u`: horizontal position from `0` (left) to `1` (right)
- `v`: vertical position from `0` (bottom) to `1` (top)

## Command Contract

Required:

- `target_id`
- `command`

Commands:

- `set_code`: set procedural expression
- `set_matrix`: replace with explicit matrix
- `stamp`: apply reusable brush profile
- `set_bulb`: quick Gaussian protrusion
- `cut_hole`: rectangular cut
- `draw_curve`: sinusoidal depth pattern
- `smooth`: blur matrix values
- `normalize`: remap current matrix to `[min_value, max_value]`
- `invert`: flip thickness values in current range
- `set_cell`: assign one matrix cell
- `reset`: remove surface shaping
- `get_wall_surface`: inspect current mode, range, thresholds, and shape summary

## Recommended AI Workflow

1. Start with `set_code` for broad shape.
2. Convert/refine with matrix operations (`stamp`, `set_cell`, `smooth`).
3. Use `normalize` to stabilize numeric range.
4. Set `hole_threshold` explicitly when creating perforations.
5. Keep `description` updated so later passes stay consistent.

## Practical Patterns

Central bulb:

`command=set_code`
`code="1 + 2*Math.exp(-((u-0.5)**2 + (v-0.5)**2)/0.02)"`

Arched cutout:

`command=set_code`
`code="((u-0.5)**2/(0.18**2) + (v-0.72)**2/(0.24**2) < 1) ? 0 : 1"`

Two-stage refine:

1. `command=stamp, shape=gaussian, blend=max`
2. `command=smooth, passes=2`
3. `command=normalize, min_value=0, max_value=3`
