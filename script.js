// Dot field background: every tab morphs the dots into its own shape
import { DotField, PALETTES } from './dot-field.js';
import { samplePortrait } from './dot-portrait.js';

// [x, y, scale]: x and y in half-view units (1 reaches the screen edge).
// `tall` is used on portrait screens, where everything stacks in one column.
const TAB_SCENES = {
    blog: { shape: 'book', wide: [0.2, 0.02, 1], tall: [0, 0.05, 0.75] },
    about: { shape: 'portrait', wide: [0.42, -0.08, 1.6], tall: [0, 0.05, 0.85] },
    experience: { shape: 'beam', wide: [0, 0, 1] },
    education: { shape: 'globe', wide: [0.25, 0, 1], tall: [0, 0.05, 0.8] },
    skills: { shape: 'streams', wide: [0, 0, 1] },
    projects: { shape: 'terrain', wide: [0, -0.05, 1] },
    publications: { shape: 'rings', wide: [0.42, -0.08, 0.8], tall: [0, 0, 0.7] },
    interests: { shape: 'ripples', wide: [0.46, -0.05, 1] },
};
const TAB_ORDER = Object.keys(TAB_SCENES);

let field = null;

function initBackground() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const activeTab = document.querySelector('.nav-button.active')?.dataset.tab;
    const small = window.matchMedia('(max-width: 768px)').matches;
    try {
        field = new DotField(canvas, {
            scenes: TAB_ORDER.map(tab => TAB_SCENES[tab]),
            initial: Math.max(0, TAB_ORDER.indexOf(activeTab)),
            // On phones the copy sits right on top of the shapes, so dim the bloom
            palette: small ? { ...PALETTES.violet, glow: 0.3, gain: 1.15 } : PALETTES.violet,
            count: small ? 24000 : 42000,
            pointSize: 2.6,
            maxPixelRatio: small ? 1.25 : 1.5,
            reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        field.start();
    } catch (error) {
        console.warn('Dot field disabled:', error);
        return;
    }

    samplePortrait('profile-photo.jpg', field.count)
        .then(points => field.setPortrait(points))
        .catch(error => console.warn('Portrait sampling failed:', error));

    window.addEventListener('pointermove', e => field.setPointer(e.clientX, e.clientY), { passive: true });
    document.addEventListener('pointerleave', () => field.clearPointer());
    window.addEventListener('blur', () => field.clearPointer());
    // Clicks that aren't on a control send a ripple through the dots
    document.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input, textarea, select')) return;
        field.ripple(e.clientX, e.clientY);
    });
}

// Tab functionality with smooth fade transitions
function openTab(tabName) {
    field?.morphTo(TAB_ORDER.indexOf(tabName));

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
            'projects': 'Featured Projects',
            'publications': 'Publications',
            'blog': 'Blog Posts',
            'interests': 'Interests'
        };
        
        if (sectionTitle && sectionTitles[tabName]) {
            // Remove fade-out and update text
            sectionTitle.classList.remove('fade-out');
            sectionTitle.textContent = sectionTitles[tabName];
        }
    }, 300); // Match this with fade-out animation duration
}

// Initialize navigation
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-button');
    console.log(`Found ${navButtons.length} navigation buttons`);
    
    navButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const tabName = this.getAttribute('data-tab');
            console.log(`Switching to tab: ${tabName}`);
            field?.ripple(e.clientX, e.clientY, 1.2);

            // Use requestAnimationFrame for smoother transitions
            requestAnimationFrame(() => {
                openTab(tabName);
            });
        });
    });
}

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

// Smooth scrolling and animations
function initAnimations() {
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
    
    // Observe all job, degree, project, publication, and interest cards
    const cards = document.querySelectorAll('.job, .degree, .project, .publication, .interest-card, .skill-category');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}

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

// Removed loading animation to prevent blinking

// Add search functionality (optional)
function initSearch() {
    const searchInput = document.getElementById('search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const searchableElements = document.querySelectorAll('.job, .degree, .project, .publication, .interest-card, .skill-category');
        
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
function initSkillTags() {
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
}

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

// Glassmorphism glow effect - Mouse tracking for all panels and cards
function addGlowEffect(element) {
    element.addEventListener('mousemove', (e) => {
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        element.style.setProperty('--x', `${x}px`);
        element.style.setProperty('--y', `${y}px`);
    });
    
    element.addEventListener('mouseleave', () => {
        element.style.setProperty('--x', '50%');
        element.style.setProperty('--y', '50%');
    });
}

// Add 3D tilt effect
function add3DTilt(element, intensity = 5) {
    element.addEventListener('mousemove', (e) => {
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = ((y - centerY) / centerY) * intensity;
        const rotateY = ((x - centerX) / centerX) * -intensity;
        
        element.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    
    element.addEventListener('mouseleave', () => {
        element.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
}

// Apply effects to all panels and cards
function initEffects() {
    // Profile panel
    const profilePanel = document.querySelector('.profile-panel');
    if (profilePanel) {
        addGlowEffect(profilePanel);
        add3DTilt(profilePanel, 8);
    }
    
    // Updates panel
    const updatesPanel = document.querySelector('.updates-panel');
    if (updatesPanel) {
        addGlowEffect(updatesPanel);
        add3DTilt(updatesPanel, 8);
    }
    
    // Navigation buttons
    const navButtons = document.querySelectorAll('.nav-button');
    navButtons.forEach(button => {
        addGlowEffect(button);
        add3DTilt(button, 6);
    });
    
    // Section header card
    const headerCard = document.querySelector('.section-header-card');
    if (headerCard) {
        addGlowEffect(headerCard);
        add3DTilt(headerCard, 8);
    }
    
    // Section content card
    const contentCard = document.querySelector('.section-content-card');
    if (contentCard) {
        addGlowEffect(contentCard);
        add3DTilt(contentCard, 6);
    }
}

// Blog post toggle functionality
function toggleBlogPost(button) {
    const blogPost = button.closest('.blog-post');
    const fullContent = blogPost.querySelector('.blog-full-content');
    const isExpanded = fullContent.style.display !== 'none';
    
    if (isExpanded) {
        // Collapse
        fullContent.style.display = 'none';
        button.textContent = 'Show More';
    } else {
        // Expand
        fullContent.style.display = 'block';
        button.textContent = 'Show Less';
    }
}

// Make toggleBlogPost available globally
window.toggleBlogPost = toggleBlogPost;

// Main initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}

function initAll() {
    initBackground();
    initNavigation();
    initEffects();
    initAnimations();
    initSkillTags();
}
