# Plan: Modernize Zero Console UI

## Phase 1: Structure & Foundation [checkpoint: 161833c]
This phase focuses on breaking down the monolith and establishing the new file structure.

- [x] Task: Create new directory structure (`public/css`, `public/js`) and move existing inline CSS/JS to separate files. 9b832ed
    - [x] Subtask: Extract CSS to `public/css/legacy.css`.
    - [x] Subtask: Extract JS to `public/js/legacy.js`.
    - [x] Subtask: Update `index.html` to link these files and verify functionality remains unchanged.
- [x] Task: Create the new Dashboard Shell (Sidebar + Main Content Area). 0767088
    - [x] Subtask: Create `public/css/layout.css` for grid/flex layout.
    - [x] Subtask: Implement Sidebar HTML structure in `index.html`.
    - [x] Subtask: Implement navigation switching logic in `public/js/navigation.js`.
- [x] Task: Conductor - User Manual Verification 'Structure & Foundation' (Protocol in workflow.md) 161833c

## Phase 2: Component Migration & Refactoring
This phase moves functionality piece-by-piece into the new layout.

- [x] Task: Refactor "Zero Access" & "Status" into the Home View. 9a49085
    - [x] Subtask: Create `public/js/views/home.js`.
    - [x] Subtask: Move logic for verification and connection to this module.
    - [x] Subtask: Style the "Zero Access" components to match the new design.
- [x] Task: Refactor "Assets" & "Policies" management. 81a0518
    - [x] Subtask: Create `public/js/views/assets.js` and `public/js/views/policies.js`.
    - [x] Subtask: Implement the UI for listing/adding/deleting assets and policies in the new content area.
- [ ] Task: Refactor "User Management" (SCIM, SAS, Provisioning).
    - [ ] Subtask: Create `public/js/views/users.js`.
    - [ ] Subtask: Consolidate SCIM, SAS, and Token Provisioning into a unified "Users" section with tabs or sub-views.
- [ ] Task: Refactor "Audit Logs".
    - [ ] Subtask: Create `public/js/views/audit.js`.
    - [ ] Subtask: Implement the audit log viewer.
- [ ] Task: Conductor - User Manual Verification 'Component Migration & Refactoring' (Protocol in workflow.md)

## Phase 3: Visual Polish & Responsiveness
This phase focuses on the look and feel and mobile support.

- [ ] Task: Implement responsive sidebar (collapsible on mobile).
    - [ ] Subtask: Add hamburger menu and toggle logic.
    - [ ] Subtask: CSS media queries for mobile layout.
- [ ] Task: Apply visual theme (Colors, Typography, Spacing).
    - [ ] Subtask: Define CSS variables for the theme.
    - [ ] Subtask: Update all components to use the new theme.
- [ ] Task: Enhance feedback & interactions.
    - [ ] Subtask: Improve loading spinners and toast notifications for success/error events.
- [ ] Task: Conductor - User Manual Verification 'Visual Polish & Responsiveness' (Protocol in workflow.md)
