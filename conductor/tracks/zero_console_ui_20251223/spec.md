# Specification: Modernize Zero Console UI

## Overview
The goal of this track is to modernize the Zero Console UI by replacing the existing monolithic `index.html` with a structured, responsive, and visually appealing dashboard. The new UI will separate concerns (HTML, CSS, JS), introduce a sidebar navigation, and improve the overall user experience for managing assets, policies, users, and audit logs.

## Goals
1.  **Modularization:** Split the single `index.html` into separate HTML structure, CSS stylesheets, and JavaScript files.
2.  **Navigation:** Implement a sidebar navigation to switch between different views (Dashboard, Assets, Policies, Users, Audit) instead of a long scrolling page.
3.  **Responsiveness:** Ensure the layout works seamlessly on desktop and mobile devices.
4.  **Visual Polish:** Apply a consistent design language (colors, typography, spacing) that aligns with modern standards.
5.  **UX Improvements:** Improve feedback mechanisms (loading states, success/error messages) and form interactions.

## Technical Approach
-   **Frontend Stack:** HTML5, CSS3, Vanilla JavaScript (ES6+).
-   **CSS:** Custom CSS with CSS Variables for theming, Flexbox/Grid for layout. No heavy external frameworks (like Bootstrap) to keep it lightweight, unless strictly necessary.
-   **Icons:** Use a lightweight icon set (e.g., FontAwesome CDN or SVG icons).
-   **Architecture:**
    -   `public/index.html`: Main entry point with shell layout.
    -   `public/css/`: Stylesheets (`main.css`, `dashboard.css`, `components.css`).
    -   `public/js/`: JavaScript modules (`app.js`, `api.js`, `ui.js`, `views/*.js`).

## Functional Requirements
-   **Dashboard Home:** "Zero Access" card (Unlock/Connect) and System Status.
-   **Assets View:** List, Add, Delete assets.
-   **Policies View:** List, Add, Delete policies.
-   **Users View:**
    -   SCIM Users (Create, List, Delete).
    -   SAS Users (List, Sync).
    -   Token Provisioning.
-   **Audit View:** Real-time audit log display.
-   **Responsive Mobile View:** Collapsible sidebar, touch-friendly inputs.

## Non-Functional Requirements
-   Maintain existing API integration logic.
-   Fast load times.
-   Clean and maintainable code structure.
