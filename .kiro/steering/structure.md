# Project Structure & Organization

## Root Directory Layout

```
/
├── index.html              # Main portfolio site (immersive experience)
├── minimalist.html         # Alternative minimal site
├── earningsSurprise.html   # Specialized data visualization page
├── content.json           # Project data and portfolio content
├── profile.json           # Professional experience and skills data
├── CNAME                  # Custom domain configuration
├── cardIcon.svg           # Site logo/icon
├── text.svg              # Text logo variant
├── css/                  # Stylesheets
├── js/                   # JavaScript modules
├── images/               # All visual assets
├── sounds/               # Audio assets
├── icons/                # SVG icons
└── vendor/               # Third-party libraries
```

## Core Files

### HTML Pages
- **index.html**: Primary portfolio experience with interactive elements
- **minimalist.html**: Clean, text-focused alternative version
- **earningsSurprise.html**: Specialized data analysis dashboard

### Data Files
- **content.json**: Project portfolio data, categories, descriptions, images
- **profile.json**: Work experience, education, skills, interests

### Configuration
- **CNAME**: Domain routing for GitHub Pages hosting

## Asset Organization

### Images Directory (`/images/`)
Organized by project type and purpose:
- Project screenshots (e.g., `App1.png`, `Backtester1.png`)
- Game assets (prefixed with `g_`: `g_snake.png`, `g_space.png`)
- General portfolio images (`pic01.jpg` through `pic11.jpg`)
- Specialized project images with descriptive names

### CSS Structure (`/css/`)
- **style.css**: Main stylesheet with component-based organization
  - Modal systems (TLDR, project modals)
  - Interactive elements (dots grid, card system)
  - Responsive layouts and animations
  - Tab navigation and constellation effects

### JavaScript Architecture (`/js/`)
- **main.js**: Single comprehensive module containing:
  - Interactive dots grid system
  - Project card drag-and-drop functionality
  - Modal management
  - Data loading and rendering
  - Animation controllers

### Vendor Dependencies (`/vendor/`)
```
vendor/
├── css/
│   ├── webflow.shared.css
│   ├── slater-23333.css
│   └── slater-23336.css
└── js/
    ├── gsap.min.js
    ├── InertiaPlugin.min.js
    ├── jquery-3.5.1.min.js
    └── webflow.js
```

## Code Organization Patterns

### CSS Methodology
- Component-based class naming
- Responsive-first approach with mobile breakpoints
- Animation keyframes grouped by functionality
- CSS custom properties for theming

### JavaScript Architecture
- Module pattern with IIFE where appropriate
- Event-driven interactions
- Separation of data loading and UI rendering
- GSAP integration for smooth animations

### Data Structure
- JSON-based content management
- Structured project categorization
- Consistent data schemas across content types
- Separation of static content from dynamic behavior

## Development Conventions

### File Naming
- Lowercase with hyphens for HTML files
- camelCase for JavaScript functions and variables
- Descriptive names for image assets
- Prefixed naming for categorized content (e.g., `g_` for games)

### Code Style
- 2-space indentation
- Semicolon usage in JavaScript
- Consistent quote usage (single quotes preferred)
- Descriptive variable and function names

### Asset Management
- Manual optimization of images before commit
- Vendor libraries stored locally (not CDN)
- SVG icons for scalable graphics
- Organized directory structure for easy maintenance