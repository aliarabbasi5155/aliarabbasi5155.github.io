// Dot field background: every tab morphs the dots into its own shape, and on
// desktop the same field renders the liquid-glass panes
import { DotField, PALETTES } from './dot-field.js';
import { samplePortrait } from './dot-portrait.js';

// [x, y, scale]: x and y in half-view units (1 reaches the screen edge).
// `tall` is used on portrait screens, where everything stacks in one column.
// Titles, letters and shape names live on the nav buttons, so each language
// page carries its own.
const TAB_SCENES = {
    blog: { shape: 'book', wide: [0.2, 0.02, 1], tall: [0, 0.05, 0.75] },
    about: { shape: 'portrait', wide: [0.42, -0.08, 1.6], tall: [0, 0.05, 0.85] },
    experience: { shape: 'beam', wide: [0, 0, 1] },
    education: { shape: 'globe', wide: [0.25, 0, 1], tall: [0, 0.05, 0.8] },
    skills: { shape: 'streams', wide: [0, 0, 1] },
    projects: { shape: 'terrain', wide: [0, -0.05, 1] },
    publications: { shape: 'rings', wide: [0.42, -0.08, 1], tall: [0, 0, 0.7] },
    interests: { shape: 'ripples', wide: [0.46, -0.05, 1] },
};
const TAB_ORDER = Object.keys(TAB_SCENES);

// The few strings the script writes itself
const STRINGS = {
    en: {
        bands: ['DELTA', 'THETA', 'ALPHA', 'BETA', 'GAMMA'],
        hertz: value => `${value.toFixed(1)} HZ`,
        more: 'Show More',
        less: 'Show Less',
        glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/',
    },
    fa: {
        bands: ['دلتا', 'تتا', 'آلفا', 'بتا', 'گاما'],
        hertz: value => `${value.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} هرتز`,
        more: 'ادامه‌ی مطلب',
        less: 'بستن',
        glyphs: 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی۰۱۲۳۴۵۶۷۸۹',
    },
};
const TEXT = STRINGS[document.documentElement.lang] ?? STRINGS.en;

// The field renders the glass only where the layout is pinned to the viewport;
// stacked layouts scroll, and CSS glass keeps up with scrolling better
const GLASS_QUERY = window.matchMedia('(min-width: 1101px) and (hover: hover) and (pointer: fine)');
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Upper edges of the EEG bands, in Hz
const BAND_LIMITS = [4, 8, 13, 30, Infinity];

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
            // On phones the copy sits right on top of the shapes, so keep them quieter
            palette: small ? { ...PALETTES.sand, gain: 1.05 } : PALETTES.sand,
            // Right-to-left pages mirror the shapes along with the layout
            mirror: document.documentElement.dir === 'rtl',
            count: small ? 24000 : 42000,
            pointSize: 2.6,
            maxPixelRatio: small ? 1.25 : 1.5,
            reduceMotion: REDUCE_MOTION,
        });
        field.start();
    } catch (error) {
        console.warn('Dot field disabled:', error);
        return;
    }

    samplePortrait(new URL('profile-photo.jpg', import.meta.url).href, field.count)
        .then(points => field.setPortrait(points))
        .catch(error => console.warn('Portrait sampling failed:', error));

    const applyGlass = () => {
        document.documentElement.classList.toggle('gl-glass', GLASS_QUERY.matches);
        field.setGlass(GLASS_QUERY.matches ? document.querySelectorAll('.glass') : []);
    };
    GLASS_QUERY.addEventListener('change', applyGlass);
    applyGlass();

    window.addEventListener('pointermove', e => field.setPointer(e.clientX, e.clientY), { passive: true });
    document.addEventListener('pointerleave', () => field.clearPointer());
    window.addEventListener('blur', () => field.clearPointer());
    // Clicks that aren't on a control send a ripple through the dots
    document.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input, label, textarea, select')) return;
        field.ripple(e.clientX, e.clientY);
    });
}

// The dock's slider sets how lively the field is, read out as an EEG band
function initEnergy() {
    const input = document.querySelector('.energy input');
    if (!input) return;
    const band = document.querySelector('.energy b');
    const hz = document.querySelector('.energy-hz');
    const apply = () => {
        const value = input.value / 100;
        // Log scale from 1.5 Hz to 40 Hz
        const frequency = 1.5 * (40 / 1.5) ** value;
        band.textContent = TEXT.bands[BAND_LIMITS.findIndex(limit => frequency < limit)];
        hz.textContent = TEXT.hertz(frequency);
        field?.setEnergy(value);
    };
    input.addEventListener('input', apply);
    apply();
}

// Letters cycle through random glyphs, then settle left to right
function scramble(element, text, duration = 600) {
    cancelAnimationFrame(element.scrambleFrame);
    if (REDUCE_MOTION) {
        element.textContent = text;
        return;
    }
    const start = performance.now();
    const glyphs = TEXT.glyphs;
    const step = now => {
        const progress = Math.min(1, (now - start) / duration);
        const settled = Math.floor(progress * text.length);
        let out = '';
        for (let i = 0; i < text.length; i++) {
            // Spaces and zero-width non-joiners keep the word shapes in place
            const keep = i < settled || text[i] === ' ' || text[i] === '\u200c';
            out += keep ? text[i] : glyphs[(Math.random() * glyphs.length) | 0];
        }
        element.textContent = out;
        if (progress < 1) element.scrambleFrame = requestAnimationFrame(step);
    };
    element.scrambleFrame = requestAnimationFrame(step);
}

// Tab functionality with smooth fade transitions
function openTab(tabName) {
    field?.morphTo(TAB_ORDER.indexOf(tabName));
    const tabButton = document.querySelector(`.nav-button[data-tab="${tabName}"]`);
    if (tabButton) {
        document.getElementById('section-badge').textContent = tabButton.querySelector('.nav-letter').textContent;
        scramble(document.getElementById('field-tag'), tabButton.dataset.field, 500);
    }

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
        
        if (sectionTitle && tabButton) {
            // Remove fade-out and scramble in the new title
            sectionTitle.classList.remove('fade-out');
            scramble(sectionTitle, tabButton.dataset.title);
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

// Blog post toggle functionality
function toggleBlogPost(button) {
    const blogPost = button.closest('.blog-post');
    const fullContent = blogPost.querySelector('.blog-full-content');
    const isExpanded = fullContent.style.display !== 'none';
    
    if (isExpanded) {
        // Collapse
        fullContent.style.display = 'none';
        button.textContent = TEXT.more;
    } else {
        // Expand
        fullContent.style.display = 'block';
        button.textContent = TEXT.less;
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
    initEnergy();
    initNavigation();
    initAnimations();
    initSkillTags();
}
