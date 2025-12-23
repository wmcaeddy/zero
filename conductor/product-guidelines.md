# Product Guidelines - Zero-SPA

## Communication & Prose Style
- **Concise and Direct:** All documentation and user interfaces must use minimalist text and clear labels. We prioritize efficiency for administrators and developers who need to act quickly.
- **Clarity Over Fluff:** Avoid marketing jargon. Focus on the direct utility and technical requirements of each feature.

## Visual Identity & UI/UX Principles
- **Modern & Minimalist:** The "Zero Console" and CLI tools should feature clean layouts with intentional whitespace. We focus on essential information to reduce cognitive load when managing complex network policies.
- **Information Hierarchy:** Crucial status indicators (e.g., Service Status, Firewall State) should be prominent, while secondary details (e.g., metadata) should be accessible but not distracting.

## Feedback & Error Handling
- **Comprehensive and Verbose:** To facilitate rapid debugging and system transparency, the project provides detailed logs and system feedback.
- **Developer-Centric:** Error messages should include relevant technical details or stack traces where appropriate to ensure that issues can be diagnosed without deep manual investigation of background processes.

## User Experience (UX) Focus
- **Simplified Onboarding:** Our primary UX objective is streamlining the initial setup. This includes:
    - Automated server-side configuration scripts.
    - A friction-less "First Connection" flow for clients.
    - Guided walkthroughs for generating TOTP secrets and configuring initial access rules.
