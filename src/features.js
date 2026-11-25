const config = require('./config');

// Every tool in the studio. Set status to 'live' once its API is wired.
// To add a tool: add an entry here, create a route + view, done.
module.exports = [
  { slug: 'clips', name: 'Clip finder', desc: 'Paste a YouTube link and get the best moments with timestamps, titles and hooks.', status: 'live', href: '/tools/clips', cost: config.costs.clips },
  { slug: 'video', name: 'AI video maker', desc: 'Turn an idea into a finished video: AI script, images, voiceover and captions.', status: config.video.enabled ? 'live' : 'soon', href: '/tools/video', cost: config.costs.video },
  { slug: 'download', name: 'Video downloader', desc: 'Save a video or just its audio from a link, in the quality you choose.', status: config.downloader.enabled ? 'live' : 'soon', href: '/tools/download', cost: config.costs.download },
  { slug: 'handwriting', name: 'Text to handwriting', desc: 'Turn typed text into handwritten A4 pages in English or Urdu. Pick ink, style and paper.', status: config.hand.enabled ? 'live' : 'soon', href: '/tools/handwriting', cost: config.costs.hand },
  { slug: 'script', name: 'Script writer', desc: 'Turn an idea or a long video into a tight short-form script.', status: 'soon' },
  { slug: 'captions', name: 'Captions and subtitles', desc: 'Accurate captions with styles you can export.', status: 'soon' },
  { slug: 'voice', name: 'Voiceover', desc: 'Natural voiceovers from text in 580+ voices and many languages. Download as MP3.', status: config.tts.enabled ? 'live' : 'soon', href: '/tools/voice', cost: config.costs.voice },
  { slug: 'image', name: 'Thumbnail and image generator', desc: 'Generate thumbnails and visuals from a prompt.', status: 'soon' },
  { slug: 'repurpose', name: 'Video to blog post', desc: 'Repurpose any video into an article or newsletter.', status: 'soon' },
];
