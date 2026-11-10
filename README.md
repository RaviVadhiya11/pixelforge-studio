# PixelForge Studio

A responsive, browser-based image and PDF utility platform with an original clean interface.

## Live site
After GitHub Pages is enabled:
https://RaviVadhiya11.github.io/pixelforge-studio/

## Image tools
- Compress images with adjustable output quality
- Resize by percentage, pixel width, social presets, Full HD, 4K, 8K and custom dimensions
- Crop by X/Y position and pixel width/height
- Convert to JPG/JPEG, PNG, WebP and AVIF where supported
- 2×, 3× and 4× browser-based image enlargement
- Rotate and flip
- Text watermark with opacity and position controls
- Blur a rectangular area to hide private details
- Meme captions
- Batch processing for supported image operations
- AI-assisted background removal through an optional in-browser model

## PDF tools
- Combine images into a PDF
- Merge multiple PDFs
- Render PDF pages to JPG (up to 30 pages per run)
- Re-save/optimize PDF structure

## Format support
Image decoding is controlled by the user's browser. JPG, PNG, WebP and many GIF/SVG/BMP/AVIF files are commonly supported, but HEIC/HEIF and TIFF decoding is not guaranteed. Output formats are JPG, PNG, WebP and AVIF only when the browser encoder supports it. Animated GIFs are not preserved as animation.

## Important technical limitations
- 4K/8K resize and 2×/3×/4× upscale use browser resampling, not AI super-resolution. They cannot reconstruct missing image detail.
- Background removal loads an open-source model from jsDelivr. First use downloads model files; it may be slow or fail on unsupported browsers, low-memory phones or restricted networks.
- PDF tools load pdf-lib and PDF.js from public CDNs. Large files can use substantial memory.
- PDF re-saving does not guarantee a smaller file or recompress every embedded image.
- Blur tool masks one rectangular region per image; inspect output before sharing sensitive images.
- Very large batch jobs can exceed available mobile memory.

## Privacy
Image processing is performed in the browser where supported. Selected files are not uploaded to a PixelForge server by the image tools. Third-party library/model assets are fetched from CDNs when the relevant tools are used. Review the Privacy Policy and update it to match your actual deployment and analytics/ad configuration.

## Publish on GitHub Pages
1. Open repository Settings → Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Select branch `main` and folder `/(root)`.
4. Save and wait for GitHub Pages to publish.

## Monetization
No ads, subscription billing, payment gateway, or revenue tracking is configured. Monetization requires separate setup and approval (for example, an ad network), accurate legal/contact information, compliance with provider policies, and real traffic. Revenue is not guaranteed. Do not add an ads.txt file until an ad provider gives you the exact publisher details.

## Before public launch
- Replace the contact email placeholders in `privacy.html` and `terms.html`.
- Review legal pages for your actual data practices, analytics and ad providers.
- Test every tool on the target browsers and phones.
- Confirm GitHub Pages is enabled and the live site loads over HTTPS.

## Technology
Static HTML, CSS and JavaScript. No build step or backend server is required for the core browser tools.
