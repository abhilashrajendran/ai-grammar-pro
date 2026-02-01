# AI Grammar Pro v2.0 - Enhanced Edition

## 🎉 What's New in v2.0

### Major Features Added

#### 1. **Floating AI Button** ⭐
- **Auto-appears** on all editable elements when you focus on them
- **Click to invoke** manual grammar check and AI suggestions anytime
- **Smart positioning** - Floats in the top-right corner of the input field
- **Loading animation** - Visual feedback while checking
- Works on: textareas, text inputs, email inputs, search boxes, contentEditable divs

#### 2. **Universal Input Support** 🌐
- ✅ `<textarea>` elements
- ✅ `<input type="text">`
- ✅ `<input type="email">`
- ✅ `<input type="search">`
- ✅ `<input type="url">`
- ✅ `<input type="tel">`
- ✅ `contentEditable` divs (Gmail, Medium, etc.)
- ❌ Excludes: password, file, checkbox, radio inputs (for security)

#### 3. **Enhanced AI Popup** 💬
- **Style selector buttons** - Choose writing style on-the-fly
  - 📝 Professional (Formal business writing)
  - 💬 Casual (Friendly conversation)
  - 🎓 Academic (Scholarly tone)
  - ⚡ Concise (Shortened version)
- **Copy button** (📋) - Copy AI suggestion to clipboard
- **Apply button** (✓) - Replace your text with AI suggestion in one click
- **Smart positioning** - Auto-adjusts to stay in viewport
- **Visual feedback** - Buttons highlight when active

#### 4. **Dynamic Element Detection** 🔍
- **MutationObserver** watches for new editable elements
- **Works on SPAs** - Gmail, Google Docs, React apps, etc.
- **Auto-detection** - No manual refresh needed
- **Lightweight** - Minimal performance impact

#### 5. **Improved UX** ✨
- **Toast notifications** - Quick feedback messages
- **Loading states** - Visual indicators for async operations
- **Better error handling** - Graceful degradation
- **Smooth animations** - Modern, polished feel
- **Accessibility** - Keyboard navigation and screen reader support

---

## 📋 Complete Feature List

### Grammar Checking
- ✅ Real-time error detection (1-second debounce)
- ✅ Wavy red underlines for errors
- ✅ Click underlined words for suggestions
- ✅ Hover effects on errors
- ✅ Multiple error highlighting
- ✅ LanguageTool integration

### AI Rephrasing
- ✅ Multiple writing styles
- ✅ One-click application
- ✅ Copy to clipboard
- ✅ Context-aware suggestions
- ✅ Ollama integration (local LLM)

### User Interface
- ✅ Floating action button
- ✅ Modern popup design
- ✅ Responsive layout
- ✅ Dark mode compatible
- ✅ Toast notifications
- ✅ Loading indicators

### Technical Features
- ✅ MutationObserver for dynamic content
- ✅ WeakSet for memory efficiency
- ✅ Event delegation
- ✅ Debounced checking
- ✅ Smooth scroll sync
- ✅ Viewport-aware positioning

---

## 🎯 How to Use

### Automatic Mode (Grammar Checking)
1. **Start typing** in any text field
2. **Wait 1 second** - Grammar check runs automatically
3. **Click red underlines** - See and apply suggestions

### Manual Mode (AI Assistance)
1. **Click the floating ★ button** in the top-right of any text field
2. **View grammar issues** (if any)
3. **Click a style button** to rephrase your text
4. **Click ✓ to apply** or **📋 to copy**

### Style Selection
- **📝 Professional** - "We request your presence at the meeting"
- **💬 Casual** - "Hey, wanna come to the meeting?"
- **🎓 Academic** - "The committee cordially invites participants to convene"
- **⚡ Concise** - "Please attend the meeting"

---

## 🔧 Installation

### Prerequisites
1. **LanguageTool** (Port 8010)
   ```bash
   docker run --rm -p 8010:8010 silviof/docker-languagetool
   ```

2. **Ollama** (Port 11434)
   ```bash
   ollama pull llama3
   ollama serve
   ```

### Extension Setup
1. Download all extension files
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder
6. Done! Look for the extension icon

---

## 📁 File Structure

```
AI-Grammar-Pro-v2/
├── manifest.json          # Extension config (v1.6)
├── background.js          # Service worker (API calls)
├── content.js             # Main logic (NEW: 600+ lines)
├── style.css              # Styling (NEW: Enhanced UI)
├── icons/
│   ├── icon16.png        # Toolbar icon
│   ├── icon48.png        # Extension manager
│   └── icon128.png       # Chrome Web Store
├── README.md             # This file
└── CHANGELOG.md          # Version history
```

---

## 🆕 Key Code Changes

### content.js Enhancements

**New Functions:**
- `isEditableElement()` - Universal element detection
- `getTextFromElement()` - Extract text from any input type
- `setTextInElement()` - Set text in any input type
- `createFloatingButton()` - Render floating AI button
- `positionFloatingButton()` - Smart positioning
- `showQuickToast()` - Toast notifications
- `showManualPopup()` - Manual invocation UI
- `replaceTextRange()` - Precise text replacement

**New Event Listeners:**
- `focusin` - Show floating button
- `focusout` - Hide floating button
- MutationObserver - Detect new elements

**Enhanced Logic:**
- Support for contentEditable
- Viewport-aware popup positioning
- Active style button highlighting
- Copy/Apply functionality

### style.css Enhancements

**New Classes:**
- `.ai-grammar-float-btn` - Floating button
- `.ai-style-group` - Style button grid
- `.copy-btn` / `.apply-btn` - Action buttons
- `.ai-grammar-toast` - Notifications
- `.info-box` - Status messages
- `.style-btn.active` - Active state

**Improved Styles:**
- Gradient backgrounds
- Smooth transitions
- Pulse animations
- Responsive grid layout
- Better scrollbars
- Accessibility features

---

## 🔍 Technical Details

### Element Detection Algorithm
```javascript
1. Check if element is in DOM
2. Verify tagName exists
3. Test for textarea/input/contentEditable
4. Exclude sensitive inputs (password, etc.)
5. Add to WeakSet for tracking
6. Attach event listeners
```

### Floating Button Positioning
```javascript
1. Get element bounding rect
2. Calculate scroll offsets
3. Position at top-right corner
4. Update on scroll/resize
5. Z-index: 100001
```

### Text Extraction Strategy
```javascript
- textarea/input → element.value
- contentEditable → element.innerText
- Fallback → element.textContent
```

---

## 🐛 Known Limitations

1. **contentEditable Highlighting**
   - Mirror div not created for contentEditable (too complex)
   - Grammar errors shown in popup only
   - Full text replacement works

2. **Complex Rich Text Editors**
   - May not work with heavy JavaScript editors (TinyMCE, CKEditor)
   - Works best with native contentEditable

3. **iframes**
   - Cannot access cross-origin iframes
   - Same-origin iframes work

4. **Performance**
   - Large texts (>5000 chars) may be slow
   - Debouncing helps reduce API calls

---

## 🚀 Performance Optimizations

- ✅ **WeakSet** for element tracking (automatic garbage collection)
- ✅ **Debouncing** (1 second) to reduce API calls
- ✅ **Event delegation** instead of individual listeners
- ✅ **MutationObserver** with targeted subtree
- ✅ **Lazy popup creation** (only when needed)
- ✅ **Minimal DOM queries** with caching

---

## 🎨 UI/UX Improvements

### Visual Polish
- Smooth fade-in animations
- Gradient backgrounds
- Modern color palette
- Consistent spacing
- Professional typography

### Interactions
- Hover effects on all buttons
- Active states for selections
- Loading indicators
- Success/error feedback
- Smooth transitions

### Accessibility
- Focus outlines
- High contrast mode support
- Reduced motion support
- ARIA labels (future enhancement)
- Keyboard navigation ready

---

## 📊 Comparison: v1.6 vs v2.0

| Feature | v1.6 | v2.0 |
|---------|------|------|
| Input Types | textarea, input[text] only | All text inputs + contentEditable |
| Manual Check | ❌ No | ✅ Floating button |
| Style Selection | Background only | ✅ In-popup buttons |
| Copy/Apply | ❌ No | ✅ Yes |
| SPA Support | ❌ No | ✅ MutationObserver |
| Toast Notifications | ❌ No | ✅ Yes |
| UI Polish | Basic | ✅ Modern gradients & animations |
| Code Size | ~300 lines | ~600 lines |

---

## 🔮 Future Roadmap

### v2.1 (Next)
- [ ] Settings panel (configure styles, shortcuts)
- [ ] Keyboard shortcuts (Ctrl+Shift+G)
- [ ] Custom dictionary
- [ ] Ignore list
- [ ] Statistics dashboard

### v2.2
- [ ] Multi-language support
- [ ] Context menu integration
- [ ] Batch processing
- [ ] Export/import settings

### v3.0
- [ ] Cloud sync (optional)
- [ ] Team dictionaries
- [ ] Advanced analytics
- [ ] Custom AI models
- [ ] Plugin system

---

## 💡 Tips & Tricks

### Best Practices
1. **Write first, check later** - Don't let the tool interrupt your flow
2. **Use manual button** - For quick checks without waiting
3. **Try different styles** - See which tone fits best
4. **Copy before applying** - Keep original in clipboard
5. **Check long texts in chunks** - Better performance

### Keyboard Shortcuts (Future)
- `Ctrl+Shift+G` - Manual check (planned)
- `Ctrl+Shift+C` - Copy suggestion (planned)
- `Ctrl+Shift+A` - Apply suggestion (planned)

### Performance Tips
- Break very long texts into paragraphs
- Use manual check for final review
- Disable on pages with many inputs if slow

---

## 🤝 Contributing

### Bug Reports
Found a bug? Please include:
- Browser version
- Extension version
- Steps to reproduce
- Screenshots/console errors

### Feature Requests
Want a feature? Describe:
- Use case
- Expected behavior
- Why it's useful

---

## 📜 License

[Your License Here - MIT, GPL, etc.]

---

## 🙏 Credits

**Created with:**
- Claude AI (Anthropic)
- LanguageTool (Open Source)
- Ollama (Open Source LLM)

**Special Thanks:**
- Chrome Extensions team
- Open source community

---

## 📞 Support

**Need Help?**
1. Check README.md
2. Check FIXES.md (technical details)
3. Review browser console for errors
4. Ensure LanguageTool & Ollama are running

**Contact:**
- GitHub Issues: [Your Repo]
- Email: [Your Email]
- Twitter: [Your Handle]

---

**Enjoy better writing with AI Grammar Pro v2.0! ✨**

*Last Updated: February 2026*
