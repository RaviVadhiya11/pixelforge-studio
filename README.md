# PixelForge Studio

A responsive, browser-based image workspace with a premium dark interface.

## Live preview
After enabling GitHub Pages, visit:
https://RaviVadhiya11.github.io/pixelforge-studio/

## Current features
- Batch image selection and processing
- Convert to JPG/JPEG, PNG, WebP and AVIF where the browser supports AVIF encoding
- Image compression with adjustable output quality
- Resize presets for Instagram square, portrait, Stories/Reels, Full HD, 4K UHD, 8K UHD and custom dimensions
- Optional light sharpening after resizing
- Download processed files individually
- Responsive mobile and desktop layout
- Local browser processing; images are not sent to a PixelForge server

## Format notes and limitations
The browser must be able to decode an input format before it can be processed. JPG, PNG, WebP and many GIF/SVG/BMP/AVIF files are commonly supported, but support varies by browser and device. HEIC/HEIF and TIFF decoding is not guaranteed. Animated GIFs are not preserved as animation. Export is currently JPG, PNG, WebP and AVIF only when the browser encoder supports it.

4K/8K output changes pixel dimensions using browser resampling; it is not AI super-resolution and cannot recreate missing detail. Very large images may exceed a phone's available memory. Use smaller dimensions on low-memory devices.

## Publish on GitHub Pages
1. Open repository Settings → Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Select branch `main` and folder `/(root)`.
4. Save and wait for GitHub Pages to publish.

## Monetization
No advertising, payment processor, subscription, or revenue system is configured in this project. Monetization requires separate account setup and approval (for example, an ad network), a suitable privacy policy/contact details, compliance with platform policies, and real visitors. Revenue is not guaranteed.

## Legal pages
Update the contact email placeholders in `privacy.html` and `terms.html` before public launch. Review the policies for your actual use and local legal requirements.

## Tech
Static HTML, CSS and JavaScript. No build step or server is required for the image workspace.
