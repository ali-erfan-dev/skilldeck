# Discoverable Bulk Actions for Skill Multi-Select

## Problem

The skill multi-select feature works (Ctrl+Click to select multiple skills), but the bulk actions (delete, deploy) are hidden behind an undiscoverable keyboard modifier. Users don't know multi-select exists until they accidentally Ctrl+Click. The floating action bar only appears at 2+ selected, so there's no hint that selection is possible.

## Solution

Replace the hidden Ctrl+Click interaction with always-visible checkboxes. Add a select-all header. Show the action bar at 1+ selected instead of 2+.

## Changes

### 1. Checkbox column on skill rows

Each skill item in the sidebar list gets a visible checkbox on the left side. The checkbox replaces the current hidden selection indicator.

**Interactions:**
- **Click checkbox** → toggles bulk selection for that skill (calls `toggleSkillSelection(skill, true)`)
- **Click row** → opens skill in editor (existing behavior, unchanged)
- **Ctrl+Click row** → still toggles selection (preserved as keyboard shortcut)

The checkbox is always visible — no hover, no mode switch, no hidden state.

### 2. Select-all header

Above the skill list (below the filter bar), add a header row with:
- A checkbox that selects/deselects all currently filtered skills
- Text label showing selection state (e.g., "3 selected")

**States:**
- None selected: unchecked
- Some selected: indeterminate (dash icon)
- All filtered selected: checked

Clicking indeterminate selects all. Clicking checked deselects all.

### 3. Floating action bar at 1+ selected

Change the condition from `selectedSkillIds.length > 1` to `selectedSkillIds.length > 0`.

The bar shows:
- Count: "1 skill selected" / "3 skills selected"
- "Deselect All" button
- "Delete Selected" button (red, destructive)
- "Deploy Selected" button (accent color)

### 4. Data-testid attributes

- `select-all-checkbox` — the select-all checkbox in the header
- Each skill row's checkbox already uses the existing `skill-item` testid; the checkbox within can use `skill-checkbox`
- Action bar buttons keep existing patterns

## Scope

Only `LibraryView.tsx` changes. No store changes — `toggleSkillSelection`, `clearSelection`, `getSelectedSkills`, `deleteSelectedSkills` already exist in the skill store.

## Out of scope

- Changes to Projects view
- Changes to the SkillEditor component
- Changes to deployment or delete modals (they already exist)