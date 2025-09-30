# Paper+

A modern, minimalist web application for viewing PDF papers alongside interactive HTML content in split-screen mode. Perfect for academic papers with accompanying computational tools, educational content, or any scenario where you need to reference documents while using interactive web apps side-by-side.

## ✨ Features

- **🎯 Drag & Drop Support**: Simply drag PDF and HTML files anywhere into the viewer
- **👁️ Multiple View Modes**:
  - Split view (side-by-side or stacked)
  - Paper-only view
  - HTML-only view
- **🎨 Modern, Compact UI**:
  - Minimalist toolbar with icon-based controls
  - Dark and light themes
  - Keyboard shortcuts for all major functions
  - Fullscreen mode support
- **📐 Flexible Layout**:
  - Horizontal or vertical split orientations
  - Draggable divider for precise sizing (15% to 85%)
  - Quick swap positions with one click
- **📦 Bundle Format**: Save and share both files as a single `.texhtml` bundle
- **💾 Persistent Settings**: View preferences automatically saved locally
- **🔍 PDF Zoom Controls**: Adjust PDF zoom level (25% to 200%)

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

1. **Load PDF**: Click the 📄 button or drag a PDF file anywhere
2. **Load HTML**: Click the 🌐 button or drag an HTML file anywhere
3. **Open Bundle**: Click 📦 to load a previously saved `.texhtml` bundle

### Keyboard Shortcuts

- **⌘/Ctrl + 1**: Split view
- **⌘/Ctrl + 2**: Paper-only view
- **⌘/Ctrl + 3**: HTML-only view
- **⌘/Ctrl + D**: Toggle dark/light theme
- **⌘/Ctrl + S**: Swap panes
- **⌘/Ctrl + H**: Hide/show toolbar
- **F11**: Toggle fullscreen

### View Controls

- **View Mode Pills**: Switch between split/paper/HTML views
- **Orientation Buttons**: ↔ horizontal or ↕ vertical split
- **Swap Button**: ⇄ switch positions of panes
- **Split Slider**: Drag the divider or use the slider to adjust split percentage
- **Zoom Controls**: ± buttons to adjust PDF zoom level

### Creating .texhtml Bundles

The `.texhtml` format is a ZIP file containing:
- `manifest.json` - Metadata and layout preferences
- `paper.pdf` - Your PDF document
- `app.html` - Your interactive HTML content

To create a bundle:
1. Load both a PDF and HTML file
2. Configure your preferred layout settings (view mode, split %, orientation)
3. Click 💾 "Save Bundle"
4. Share the single `.texhtml` file with others - they can open it to restore your exact layout

### Bundle Structure

```
bundle.texhtml (ZIP file)
├── manifest.json
├── paper.pdf
└── app.html
```

Example `manifest.json`:
```json
{
  "version": 1,
  "title": "My Paper + App",
  "paper": "paper.pdf",
  "app": "app.html",
  "layout": "split",
  "split": 50,
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

## HTML Content Requirements

For best results, your HTML content should be:
- **Self-contained**: Include all CSS and JavaScript inline or use absolute URLs
- **Responsive**: Adapt to different container sizes
- **Cross-origin friendly**: Avoid restrictions that prevent iframe loading

### Example HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Interactive App</title>
    <style>
        /* All styles inline for portability */
        body { font-family: sans-serif; padding: 20px; }
    </style>
</head>
<body>
    <h1>Interactive Content</h1>
    <!-- Your app UI here -->
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

## 💡 Use Cases

- **📚 Academic Papers**: Pair research papers with computational supplements or interactive demos
- **🎓 Educational Content**: Combine theoretical PDFs with interactive examples and exercises
- **📖 Technical Documentation**: Reference manuals alongside live code examples or API playgrounds
- **🔬 Research Tools**: Share reproducible calculations with methodology papers
- **📊 Data Analysis**: View reports side-by-side with interactive data visualizations
- **🧮 Mathematical Content**: Math papers with live calculators and visualizations

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

Note: PDF viewing relies on the browser's built-in PDF viewer.

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

### HTML Content Not Loading
- Verify the HTML file is valid
- Check for JavaScript errors in browser console
- Ensure all resources are either inline or use absolute URLs
- Test the HTML file independently in a browser
- Check for iframe restrictions or Content-Security-Policy issues

### Bundle Issues
- Verify the `.texhtml` file is not corrupted
- Check that manifest.json contains required fields
- Ensure referenced files exist in the bundle

For more issues, please check the browser developer console for error messages.