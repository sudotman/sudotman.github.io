# Technology Stack & Build System

## Frontend Technologies

### Core Stack
- **HTML5**: Semantic markup with modern web standards
- **CSS3**: Custom styling with Flexbox/Grid layouts
- **Vanilla JavaScript**: No framework dependencies, pure ES6+
- **GSAP**: Animation library for smooth interactions and transitions
- **Chart.js**: Data visualization for interactive charts

### Vendor Libraries
- **Webflow CSS**: Base styling framework (vendor/css/webflow.shared.css)
- **jQuery 3.5.1**: DOM manipulation utilities (vendor/js/jquery-3.5.1.min.js)
- **GSAP Plugins**: InertiaPlugin for physics-based animations

### Styling Approach
- **Custom CSS**: Primary styling in `css/style.css`
- **Component-based**: Modular CSS classes for reusable components
- **Responsive Design**: Mobile-first approach with media queries
- **Dark Mode**: CSS `prefers-color-scheme` support in minimalist version

## Build System

### Deployment
- **GitHub Pages**: Static site hosting with custom domain
- **No Build Process**: Direct file serving, no compilation required
- **CNAME Configuration**: Custom domain routing via CNAME file

### Development Workflow
```bash
# Local development - serve files directly
# No build commands needed - static files only

# For local testing with live server:
npx live-server .

# Or use Python's built-in server:
python -m http.server 8000
```

### File Structure
- Static assets served directly from repository
- No transpilation or bundling required
- Vendor libraries included as static files
- Images optimized manually before commit

## Performance Considerations

### Loading Strategy
- Critical CSS inlined where possible
- Vendor scripts loaded from local files (not CDN)
- Images lazy-loaded via JavaScript intersection observer
- GSAP animations optimized for 60fps performance

### Optimization
- Manual image compression for web delivery
- Minified vendor libraries
- Efficient DOM manipulation patterns
- Reduced HTTP requests through file consolidation

## Browser Support
- Modern browsers (ES6+ support required)
- Mobile responsive design
- Touch event handling for mobile interactions
- Fallbacks for browsers without backdrop-filter support