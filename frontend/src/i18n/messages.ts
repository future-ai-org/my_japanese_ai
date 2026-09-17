const messages = {
  "meta.title.review": "my japanese AI",
  "meta.title.dashboard": "Dashboard · my japanese AI",
  "meta.title.account": "Account · my japanese AI",
  "meta.title.docs": "Documentation · my japanese AI",
  "meta.title.signIn": "Sign in · my japanese AI",
  "meta.title.register": "Create account · my japanese AI",
  "meta.title.notFound": "Page not found · my japanese AI",
  "meta.description":
    "AI-assisted English→Japanese teaching with TinySwallow. Run privately in the browser with WebLLM.",
  "brand.home": "Go to home",
  "nav.primary": "Primary navigation",
  "nav.review": "Conversation",
  "nav.dashboard": "Dashboard",
  "nav.signIn": "Sign in",
  "nav.register": "Sign up",
  "nav.signOut": "Sign out",
  "intro.title": "my ",
  "intro.titleAccent": "japanese AI",
  "provider.model": "Model",
  "provider.modelAria": "Teaching model",
  "provider.placeholder": "Select a model",
  "provider.download": "Download: ~{size} MB",
  "provider.download.help":
    "Selecting this model downloads and caches approximately {size} MB of model data.",
  "provider.context": "Context: {size} tokens",
  "provider.context.help":
    "Token budget for prompt plus output. This app uses a 4K window.",
  "provider.limit": "Limit: {size} characters",
  "provider.limit.help":
    "Max English characters so instructions and the lesson still fit in the 4K window.",
  "provider.cache": "Cache: VRAM {vram} MB",
  "provider.cache.help":
    "Browser storage for model shards, and the GPU memory this runtime expects.",
  "params.temperature": "Temperature",
  "params.temperature.help":
    "Control randomness. Lower keeps lessons consistent. Higher makes teaching notes more varied.",
  "params.tokens": "Output tokens",
  "params.tokens.help":
    "Caps generated lesson length. Short is faster; longer budgets are less likely to cut off the output.",
  "params.tokens.max": "Maximum output tokens",
  "token.short": "{tokens} · short",
  "token.medium": "{tokens} · medium",
  "token.standard": "{tokens} · standard",
  "token.long": "{tokens} · long",
  "token.extended": "{tokens} · extended",
  "editor.title": "English source",
  "editor.codeAria": "English to translate",
  "editor.exampleLanguage": "Load an example register",
  "editor.upload": "Upload",
  "editor.uploadEmpty": "That file is empty.",
  "editor.uploadFailed": "Could not read that file.",
  "editor.uploadTooLarge":
    "File loaded, but this model accepts up to {size} characters per lesson.",
  "editor.clear": "Clear",
  "editor.run": "Run lesson",
  "editor.continue": "Continue lesson",
  "editor.reviewing": "Teaching…",
  "editor.cancel": "Cancel",
  "editor.placeholder":
    "Paste English text to learn how to say it in Japanese…",
  "editor.counts": "{language} · {lines} lines · {characters} characters",
  "editor.size": "{lines} lines · {characters} characters",
  "results.title": "Results",
  "results.analyzed": "Analyzed in {seconds}s",
  "results.emptyTitle": "Ready when you are",
  "results.emptyBody":
    "Paste English, upload a text file, or load an example to start a lesson.",
  "results.reviewingBody": "Building a Japanese translation and teaching notes…",
  "results.generating": "Loading and generating…",
  "results.streamAria": "Generated lesson output",
  "results.errorTitle": "Lesson could not run",
  "results.save": "Save lesson",
  "results.saving": "Saving…",
  "results.cancelled": "Lesson cancelled.",
  "results.paused": "Lesson paused. Continue from where it stopped.",
  "results.interrupted": "Interrupted",
  "results.interruptedTitle": "Lesson interrupted",
  "results.interruptedBody":
    "The local model stopped partway through. Continue from the last generated tokens.",
  "browser.loading": "Loading {model}",
  "browser.loading.percent": "{percent}%",
  "browser.loading.elapsed": "{seconds}s elapsed",
  "browser.loading.size": "Download ~{size} MB",
  "browser.loading.hint":
    "The first visit fetches model shards and compiles WebGPU shaders. Later lessons reuse this browser cache.",
  "browser.reviewing": "Teaching your translation",
  "browser.reviewing.hint":
    "After the model is loaded, WebLLM still prefills your prompt on this device. The first token can take a while, especially on a software GPU.",
  "browser.reviewing.hint.generate":
    "Tokens are streaming from the local model. Partial lessons appear as soon as the JSON is valid.",
  "browser.generating": "Generating the lesson…",
  "browser.preparing": "Preparing the local model…",
  "browser.resuming": "Continuing the interrupted lesson…",
  "browser.ready": "Local model ready.",
  "browser.readyBody": "TinySwallow is loaded in this browser.",
  "review.selectModel": "Select a model before running a lesson.",
  "review.failed": "Could not run the lesson.",
  "gpu.unavailable.title": "WebGPU is unavailable",
  "gpu.unavailable.body":
    "Local TinySwallow lessons need WebGPU in this tab.",
  "gpu.unavailable.https":
    "Open the demo over HTTPS or http://localhost. WebGPU is blocked on file:// and other insecure origins.",
  "gpu.unavailable.chrome":
    "Chrome or Edge: WebGPU is on by default in current desktop and Android builds. If chrome://gpu or edge://gpu lists WebGPU as unavailable, turn on Use graphics acceleration when available in chrome://settings/system. On Linux, also enable chrome://flags/#enable-unsafe-webgpu and chrome://flags/#enable-vulkan, then fully quit the browser and reopen it.",
  "gpu.unavailable.brave":
    "Brave on Linux: enable brave://flags/#enable-unsafe-webgpu and set brave://flags/#use-angle to Vulkan, then fully quit every Brave process and relaunch.",
  "gpu.unavailable.firefox":
    "Firefox: use a current desktop build. If navigator.gpu is missing, set dom.webgpu.enabled to true in about:config and restart. Linux support can still require Firefox Nightly.",
  "gpu.unavailable.safari":
    "Safari: use a current Safari on macOS or iOS. Older Safari builds do not expose navigator.gpu.",
  "translation.complete": "Lesson complete",
  "translation.title": "Japanese translation",
  "lesson.title": "How to translate it",
  "lesson.generating": "Writing the lesson…",
  "lesson.missing":
    "The model finished without a lesson. Try again with a longer output length.",
  "history.loading": "Loading lesson history…",
  "history.emptyTitle": "No saved conversation yet",
  "history.star": "Star favorite",
  "history.unstar": "Remove from favorites",
  "history.favorites": "Favorites",
  "history.recent": "Recent",
  "history.delete": "Delete saved lesson",
  "history.confirmTitle": "Delete this lesson?",
  "history.confirmBody":
    "This removes the saved English source and teaching notes from your account.",
  "history.confirm": "Delete",
  "history.cancel": "Cancel",
  "history.temp": "Temp {value}",
  "history.tokens": "{value} tokens",
  "history.lines": "{value} lines",
  "history.characters": "{value} characters",
  "history.inferenceTime": "Inference time: {seconds} seconds",
  "history.loadError": "Could not load history.",
  "history.openError": "Could not open history.",
  "history.deleteError": "Could not delete history.",
  "history.starError": "Could not update favorite.",
  "history.saveError": "Could not save lesson.",
  "history.saved": "Lesson saved.",
  "history.deleted": "Lesson deleted.",
  "dashboard.library": "Your conversations",
  "dashboard.account": "Account",
  "auth.signInTitle": "Sign in",
  "auth.registerTitle": "Create an account",
  "auth.name": "Name",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.confirmPassword": "Confirm password",
  "auth.passwordMismatch": "Passwords do not match.",
  "auth.submitSignIn": "Sign in",
  "auth.submitRegister": "Sign up",
  "auth.switchToSignIn": "Already have an account? Sign in",
  "auth.switchToRegister": "Create a new account",
  "auth.failed": "Authentication failed.",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",
  "account.export": "Export my data",
  "account.exported": "A copy of your account data was downloaded.",
  "account.exportError": "Could not export account data.",
  "account.deleteTitle": "Delete account",
  "account.deleteBody":
    "This permanently deletes your account, saved lessons, and sessions.",
  "account.confirmPassword": "Confirm password",
  "account.delete": "Delete account",
  "account.deleteError": "Could not delete the account.",
  "account.retention":
    "Saved conversations are retained for {history} days.",
  "docs.summary": "Documentation",
  "docs.pager": "Page navigation",
  "docs.previous": "Previous",
  "docs.next": "Next",
  "notFound.title": "Page not found",
  "notFound.body":
    "That URL is not part of my japanese AI. Check the link or go back to the lesson workspace.",
  "notFound.home": "Back to lesson",
  "error.title": "Something went wrong",
  "error.body": "The application hit an unexpected error.",
  "error.reload": "Reload",
  "toast.dismiss": "Dismiss notification",
  "footer.made": "Made with 💜 by Marina von Steinkirch",
} as const;

export type MessageKey = keyof typeof messages;

export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return interpolate(messages[key], vars);
}
