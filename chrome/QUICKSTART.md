# 🚀 AI Grammar Pro v2.0 - Quick Start Guide

## ⚡ 3-Minute Setup

### Step 1: Start Required Services

**Terminal 1 - LanguageTool:**
```bash
docker run --rm -p 8010:8010 silviof/docker-languagetool
```

**Terminal 2 - Ollama:**
```bash
ollama pull llama3
ollama serve
```

### Step 2: Install Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Toggle **"Developer mode"** (top-right)
4. Click **"Load unpacked"**
5. Select this folder
6. ✅ Done!

---

## 🎯 How to Use

### Automatic Mode
1. Type in any text field
2. Wait 1 second
3. Red underlines appear for errors
4. Click underlines for fixes

### Manual Mode (NEW!)
1. Click the **★ floating button** (top-right of any text input)
2. View grammar issues
3. Click a style button (📝💬🎓⚡)
4. Click ✓ to apply or 📋 to copy

---

## 🌐 Works On

✅ Gmail, Outlook, Yahoo Mail  
✅ Google Docs, Notion, Medium  
✅ Twitter, Facebook, LinkedIn  
✅ Reddit, Discord, Slack  
✅ All websites with text inputs!

---

## 📁 Files Included

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config |
| `background.js` | API handler |
| `content.js` | Main logic (NEW v2.0) |
| `style.css` | UI styling (ENHANCED) |
| `icon*.png` | Extension icons |
| `README-v2.md` | Full documentation |
| `demo.html` | Interactive demo |

---

## 🆕 What's New in v2.0

### 1. Floating AI Button ⭐
- Appears on ANY text input when focused
- Click to check grammar & get AI suggestions
- Smart positioning (top-right corner)

### 2. Universal Support 🌐
- Textareas ✅
- Text inputs ✅
- Email/search fields ✅
- ContentEditable (Gmail, Docs) ✅

### 3. Enhanced Popup 💬
- **4 style buttons** (Professional, Casual, Academic, Concise)
- **Copy button** (📋) - Copy to clipboard
- **Apply button** (✓) - Replace text instantly
- Better design & animations

### 4. Smart Detection 🔍
- Auto-detects new text fields (SPAs)
- Works on Gmail, Google Docs
- No page refresh needed

### 5. Better UX ✨
- Toast notifications
- Loading indicators
- Smooth animations
- Modern design

---

## 🎨 Writing Styles

| Style | Example |
|-------|---------|
| 📝 **Professional** | "We kindly request your attendance at the meeting." |
| 💬 **Casual** | "Hey! Wanna come to the meeting?" |
| 🎓 **Academic** | "Participants are cordially invited to convene." |
| ⚡ **Concise** | "Please attend the meeting." |

---

## 🔧 Troubleshooting

**No floating button?**
- Check if extension is enabled
- Refresh the page
- Click inside a text field

**Underlines not showing?**
- Ensure LanguageTool is running: `curl http://localhost:8010`
- Check browser console (F12) for errors

**AI not working?**
- Ensure Ollama is running: `curl http://localhost:11434`
- Check if llama3 model is installed: `ollama list`

**Extension won't load?**
- Make sure all files are in the same folder
- Check manifest.json is valid
- Look for errors in `chrome://extensions/`

---

## 💡 Pro Tips

1. **Write first, check later** - Don't let the tool slow you down
2. **Use the ★ button** - Quick checks without waiting
3. **Try all styles** - See which tone fits best
4. **Copy before applying** - Keep your original safe
5. **Break long texts** - Check paragraphs separately for speed

---

## 📊 Performance

- **Lightweight**: <30KB total size
- **Fast**: 1-second debounce
- **Efficient**: WeakSet memory management
- **Smart**: Only checks when needed

---

## 🐛 Known Issues

1. **Very rich editors** (TinyMCE) may not work - uses complex iframe
2. **Cross-origin iframes** - Security restrictions
3. **Very long texts** (>5000 chars) - May be slow

---

## 🔮 Coming Soon

- ⌨️ Keyboard shortcuts
- ⚙️ Settings panel
- 📚 Custom dictionary
- 📊 Writing statistics
- 🌍 Multi-language support

---

## 📞 Need Help?

1. **Check README-v2.md** - Comprehensive guide
2. **Open demo.html** - Interactive examples
3. **Check console** (F12) - Look for errors
4. **GitHub Issues** - Report bugs

---

## ✨ Made Better with v2.0!

**Previous limitations (v1.6):**
- ❌ Only worked on textarea & text inputs
- ❌ No manual check option
- ❌ Had to edit background.js to change styles
- ❌ No copy/apply buttons
- ❌ Didn't work on Gmail, Google Docs

**Now in v2.0:**
- ✅ Works on ALL text inputs + contentEditable
- ✅ Floating button for manual checks
- ✅ In-popup style selection
- ✅ One-click copy & apply
- ✅ Full Gmail, Google Docs support

---

**Enjoy your enhanced writing experience! 🎉**

*AI Grammar Pro v2.0 - February 2026*
