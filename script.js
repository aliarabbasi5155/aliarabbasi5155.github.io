// Import and initialize Tubes Cursor
import TubesCursor from "https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js"

const app = TubesCursor(document.getElementById('canvas'), {
    tubes: {
        colors: ["#8b5cf6", "#667eea", "#764ba2"],
        lights: {
            intensity: 200,
            colors: ["#667eea", "#8b5cf6", "#764ba2", "#a78bfa"]
        }
    }
});

// Change colors on click
document.body.addEventListener('click', () => {
    const colors = randomColors(3);
    const lightsColors = randomColors(4);
    app.tubes.setColors(colors);
    app.tubes.setLightsColors(lightsColors);
});

function randomColors(count) {
    return new Array(count)
        .fill(0)
        .map(() => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
}

// Tab functionality with smooth fade transitions
function openTab(tabName) {
    // Get all tab contents and find the currently active one
    const tabContents = document.getElementsByClassName("tab-content");
    const activeContent = document.querySelector('.tab-content.active');
    const sectionTitle = document.getElementById('section-title');
    
    // Remove active class from all navigation buttons IMMEDIATELY for smooth animation
    const navButtons = document.querySelectorAll('.nav-button');
    navButtons.forEach(button => {
        button.classList.remove("active");
    });
    
    // Mark the corresponding navigation button as active IMMEDIATELY
    const activeButton = document.querySelector(`.nav-button[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add("active");
    }
    
    // Add fade-out class to current active content and title
    if (activeContent) {
        activeContent.classList.add('fade-out');
    }
    if (sectionTitle) {
        sectionTitle.classList.add('fade-out');
    }
    
    // Wait for fade-out animation to complete
    setTimeout(() => {
        // Remove active class and fade-out class from all tabs
        for (let i = 0; i < tabContents.length; i++) {
            tabContents[i].classList.remove("active", "fade-out");
        }
        
        // Show the selected tab content
        const newContent = document.getElementById(tabName);
        if (newContent) {
            newContent.classList.add("active");
        }
        
        // Update section title with fade-in
        const sectionTitles = {
            'about': 'Summary',
            'experience': 'Professional Experience',
            'education': 'Education',
            'skills': 'Technical Skills',
            'projects': 'Featured Projects'
        };
        
        if (sectionTitle && sectionTitles[tabName]) {
            // Remove fade-out and update text
            sectionTitle.classList.remove('fade-out');
            sectionTitle.textContent = sectionTitles[tabName];
        }
    }, 300); // Match this with fade-out animation duration
}

// Add click event listeners to navigation buttons
document.addEventListener('DOMContentLoaded', function() {
    const navButtons = document.querySelectorAll('.nav-button');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            
            // Use requestAnimationFrame for smoother transitions
            requestAnimationFrame(() => {
                openTab(tabName);
            });
        });
    });
});

// Mobile menu toggle functionality
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');

if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        navLinksContainer.classList.toggle('active');
    });
}

// Handle nav link clicks
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = link.getAttribute('data-tab');
        if (tabName) {
            openTab(tabName);
            // Close mobile menu
            navLinksContainer.classList.remove('active');
        }
    });
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (menuToggle && navLinksContainer && 
        !menuToggle.contains(e.target) && 
        !navLinksContainer.contains(e.target)) {
        navLinksContainer.classList.remove('active');
    }
});

// Smooth scrolling for internal links
document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scroll behavior to external links
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    externalLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Add a small delay to show the click feedback
            setTimeout(() => {
                // The browser will handle opening the external link
            }, 100);
        });
    });
    
    // Add animation classes for better UX
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    });
    
    // Observe all job, degree, and project cards
    const cards = document.querySelectorAll('.job, .degree, .project, .skill-category');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
});

// Add keyboard navigation for tabs
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const activeTab = document.querySelector('.tab-button.active');
        const tabs = Array.from(document.querySelectorAll('.tab-button'));
        const currentIndex = tabs.indexOf(activeTab);
        
        let newIndex;
        if (e.key === 'ArrowLeft') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        } else {
            newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        }
        
        tabs[newIndex].click();
        tabs[newIndex].focus();
    }
});

// Add loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '1';
    document.body.style.transform = 'translateY(0)';
});

// Initialize page
document.body.style.opacity = '0';
document.body.style.transform = 'translateY(20px)';
document.body.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

// Add search functionality (optional)
function initSearch() {
    const searchInput = document.getElementById('search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const searchableElements = document.querySelectorAll('.job, .degree, .project, .skill-category');
        
        searchableElements.forEach(element => {
            const text = element.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                element.style.display = 'block';
                element.style.opacity = '1';
            } else {
                element.style.display = 'none';
                element.style.opacity = '0.5';
            }
        });
    });
}

// Theme toggler (optional feature)
function initThemeToggler() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

// Print functionality
function printResume() {
    window.print();
}

// Social media sharing (optional)
function shareResume(platform) {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent('Ali Abbasi - Machine Learning Engineer');
    
    let shareUrl;
    switch(platform) {
        case 'linkedin':
            shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
            break;
        default:
            return;
    }
    
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

// Add tooltips for skill tags
document.addEventListener('DOMContentLoaded', function() {
    const skillTags = document.querySelectorAll('.skill-tag, .tech-tag');
    
    skillTags.forEach(tag => {
        tag.addEventListener('mouseenter', function() {
            // You can add custom tooltips here if needed
            this.style.transform = 'scale(1.05)';
        });
        
        tag.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
        
        // Add transition for smooth hover effect
        tag.style.transition = 'transform 0.2s ease';
    });
});

// Copy email to clipboard
function copyEmail() {
    const email = 'abbasialiar@gmail.com';
    navigator.clipboard.writeText(email).then(function() {
        // Show a temporary notification
        const notification = document.createElement('div');
        notification.textContent = 'Email copied to clipboard!';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #2ecc71;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 5px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    });
}

// Add slideIn animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
