document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add to clicked
            link.classList.add('active');
            
            // Navigate (Placeholder for now, just log)
            const view = link.getAttribute('data-view');
            console.log('Navigate to:', view);
        });
    });
});
