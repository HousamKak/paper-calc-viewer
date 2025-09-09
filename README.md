# Paper + Calculator Viewer

A React-based web application for viewing PDF papers alongside interactive HTML calculators in split-screen mode. Perfect for academic papers with accompanying computational tools, allowing readers to reference the paper while using the calculator side-by-side.

## Features

- **Drag & Drop Support**: Simply drag PDF and HTML files into the viewer
- **Multiple View Modes**: 
  - Split view (side-by-side or stacked)
  - Paper-only view
  - Calculator-only view
- **Flexible Layout**: 
  - Horizontal (side-by-side) or vertical (stacked) orientations
  - Adjustable split percentage (15% to 85%)
  - Swap positions of PDF and calculator panes
- **Bundle Format**: Save and share both files as a single `.texhtml` bundle
- **Persistent Settings**: View preferences are saved locally

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment to any static hosting service.

## Usage

### Loading Files

1. **Load PDF**: Click "Load PDF" button or drag a PDF file into the viewer
2. **Load Calculator**: Click "Load Calculator (HTML)" button or drag an HTML file into the viewer
3. **Open Bundle**: Click "Open .texhtml" to load a previously saved bundle

### View Controls

- **Split/Paper/Calculator**: Switch between different view modes
- **Split Slider**: Adjust the split percentage when in split view mode
- **Side-by-side/Stacked**: Choose orientation for split view
- **Swap**: Switch positions of PDF and calculator panes

### Creating .texhtml Bundles

The `.texhtml` format is a ZIP file containing:
- `manifest.json` - Metadata and layout preferences
- `paper.pdf` - Your PDF document  
- `calculator.html` - Your interactive calculator

To create a bundle:
1. Load both a PDF and HTML file
2. Configure your preferred layout settings
3. Click "Save .texhtml"
4. Share the single `.texhtml` file with others

### Bundle Structure

```
bundle.texhtml (ZIP file)
├── manifest.json
├── paper.pdf
└── calculator.html
```

Example `manifest.json`:
```json
{
  "version": 1,
  "title": "My Paper + Calculator",
  "paper": "paper.pdf",
  "app": "calculator.html",
  "layout": "split",
  "split": 55,
  "orientation": "horizontal"
}
```

## Development

### Project Structure

```
src/
├── App.tsx                 # Main app component
├── PaperCalcViewer.tsx     # Core viewer component
├── index.css              # Tailwind CSS imports
└── main.tsx               # React app entry point
```

### Key Technologies

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **fflate** for ZIP compression/decompression

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Calculator Requirements

For best results, your HTML calculator should be:
- **Self-contained**: Include all CSS and JavaScript inline or use absolute URLs
- **Responsive**: Adapt to different container sizes
- **Cross-origin friendly**: Avoid restrictions that prevent iframe loading

### Example Calculator Structure

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Calculator</title>
    <style>
        /* All styles inline */
    </style>
</head>
<body>
    <!-- Calculator UI -->
    <script>
        // All JavaScript inline
    </script>
</body>
</html>
```

## Deployment

### Static Hosting

Build the project and deploy the `dist` folder to:
- Netlify
- Vercel
- GitHub Pages
- Any static hosting service

### PWA/Offline Support

The app can be enhanced with a service worker to work offline. The viewer will cache loaded files in the browser for the current session.

### Desktop App

The viewer can be wrapped with Electron or Tauri to create a desktop application that can register `.texhtml` files as a custom file type.

## Use Cases

- **Academic Papers**: Pair research papers with computational supplements
- **Educational Content**: Combine theoretical content with interactive examples
- **Documentation**: Technical documentation with live calculators or demos
- **Research Tools**: Share reproducible calculations alongside methodology

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

Note: PDF viewing relies on the browser's built-in PDF viewer.

## GitHub Pages Deployment

### Quick Setup

1. **Create GitHub Repository**:
   - Go to https://github.com/new
   - Repository name: `paper-calc-viewer`
   - Description: `A React-based web application for viewing PDF papers alongside interactive HTML calculators`
   - Set to Public
   - Click "Create repository"

2. **Push Code to GitHub**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/paper-calc-viewer.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click "Settings" tab
   - Scroll to "Pages" in the left sidebar
   - Under "Source", select "GitHub Actions"
   - The app will automatically deploy when you push changes

4. **Access Your App**:
   - Your app will be available at: `https://YOUR_USERNAME.github.io/paper-calc-viewer/`
   - First deployment takes a few minutes

### Manual Deployment

If you prefer manual deployment:
```bash
npm install
npm run deploy
```

## License

This project is open source and available under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Troubleshooting

### PDF Not Loading
- Ensure the PDF file is valid and not corrupted
- Check browser console for security errors
- Try a different PDF file

### Calculator Not Loading  
- Verify the HTML file is valid
- Check for JavaScript errors in browser console
- Ensure all resources are either inline or use absolute URLs
- Test the HTML file independently in a browser

### Bundle Issues
- Verify the `.texhtml` file is not corrupted
- Check that manifest.json contains required fields
- Ensure referenced files exist in the bundle

For more issues, please check the browser developer console for error messages.