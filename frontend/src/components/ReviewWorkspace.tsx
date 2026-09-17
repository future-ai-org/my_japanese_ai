import { useRef, type ChangeEvent, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import {
  CheckCircle2,
  ChevronDown,
  Cpu,
  FileCode2,
  LoaderCircle,
  Play,
  Save,
  ShieldCheck,
  Square,
  Upload,
} from "lucide-react";
import { BrowserLoadingStatus } from "./BrowserLoadingStatus";
import { BrowserReviewingStatus } from "./BrowserReviewingStatus";
import { LoadingStars } from "./LoadingStars";
import { HelpTip } from "./HelpTip";
import { LanguageSelect } from "./LanguageSelect";
import { ProviderSelect } from "./ProviderSelect";
import { ReviewResults } from "./ReviewResults";
import { StreamPreview } from "./StreamPreview";
import { REVIEW_CONFIG } from "../config/review";
import { useReviewSession } from "../context/ReviewSessionContext";
import { useSession } from "../context/SessionContext";
import { useToast } from "../context/ToastContext";
import { LANGUAGE_LABELS } from "../data/examples";
import {
  CODE_FILE_ACCEPT,
  languageFromFilename,
} from "../data/languages";
import { paths } from "../docs/paths";
import { editorLanguage } from "../editor/languageSupport";
import { t } from "../i18n/messages";

function formatTemperature(value: number): string {
  const digits = REVIEW_CONFIG.temperature.step < 0.1 ? 2 : 1;
  return value.toFixed(digits);
}

function temperatureFillPercent(value: number): number {
  const { min, max } = REVIEW_CONFIG.temperature;
  if (max <= min) return 100;
  return ((value - min) / (max - min)) * 100;
}

function ReviewWorkspace() {
  const { user } = useSession();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const editorViewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const session = useReviewSession();
  const editorExtensions = editorLanguage();
  const temperatureProgress = temperatureFillPercent(
    session.parameters.temperature,
  );

  const maxCodeCharacters =
    session.selectedBrowserModel?.limits.maxCodeCharacters ??
    REVIEW_CONFIG.limits.maxCodeCharacters;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      if (!text.trim()) {
        pushToast("error", t("editor.uploadEmpty"));
        return;
      }

      const inferred = languageFromFilename(file.name);
      session.loadUploadedCode(text, inferred ?? undefined);

      if (text.length > maxCodeCharacters) {
        pushToast(
          "error",
          t("editor.uploadTooLarge", {
            size: maxCodeCharacters.toLocaleString(),
          }),
        );
      }
    } catch {
      pushToast("error", t("editor.uploadFailed"));
    }
  };

  const handleSave = async () => {
    if (!user) {
      navigate(paths.signIn);
      return;
    }
    const outcome = await session.handleSaveReview();
    if (outcome === "saved") {
      navigate(paths.dashboard);
    }
  };

  const modelLabel =
    session.selectedModelOption?.label ?? t("provider.placeholder");
  const waitingForOutput =
    !session.result &&
    (session.isReviewing || session.isPreloading);
  const browserLoading =
    waitingForOutput &&
    !session.modelProgress?.streamedText &&
    (session.isPreloading ||
      Boolean(session.modelProgress && session.modelProgress.progress < 1));
  const browserReviewing =
    waitingForOutput &&
    !browserLoading &&
    !session.modelProgress?.streamedText;

  return (
    <>
      <section className="intro">
        <div className="intro__heading">
          <h1>
            {t("intro.title")}
            <span>{t("intro.titleAccent")}</span>
          </h1>
        </div>
        <div className="provider-summary">
          <div className="provider-summary__selects">
            <ProviderSelect
              icon={<Cpu size={15} />}
              prefix={t("provider.model")}
              ariaLabel={t("provider.modelAria")}
              value={session.selectedModelOption?.id ?? ""}
              displayValue={modelLabel}
              placeholder={!session.selectedModelOption}
              options={[
                {
                  id: "",
                  label: t("provider.placeholder"),
                  disabled: true,
                },
                ...session.modelOptions,
              ]}
              onChange={session.handleModelChange}
            />
          </div>
          {session.selectedBrowserModel ? (
            <>
              {session.selectedBrowserModel.description ? (
                <p>{session.selectedBrowserModel.description}</p>
              ) : null}
              <div className="provider-summary__facts">
                <HelpTip
                  id="browser-download-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.download.help", {
                    size: session.selectedBrowserModel.downloadSizeMB.toLocaleString(),
                  })}
                >
                  {t("provider.download", {
                    size: session.selectedBrowserModel.downloadSizeMB.toLocaleString(),
                  })}
                </HelpTip>
                <HelpTip
                  id="browser-context-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.context.help")}
                >
                  {t("provider.context", {
                    size: session.selectedBrowserModel.contextWindowSize.toLocaleString(),
                  })}
                </HelpTip>
                <HelpTip
                  id="browser-limit-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.limit.help")}
                >
                  {t("provider.limit", {
                    size: session.selectedBrowserModel.limits.maxCodeCharacters.toLocaleString(),
                  })}
                </HelpTip>
                <HelpTip
                  id="browser-cache-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.cache.help")}
                >
                  {t("provider.cache", {
                    vram: session.selectedBrowserModel.vramRequiredMB.toLocaleString(),
                  })}
                </HelpTip>
              </div>
            </>
          ) : null}
          {session.showModelDetails && (
            <fieldset
              className="inference-parameters"
              disabled={session.isReviewing}
            >
              <div className="parameter-field">
                <HelpTip id="tokens-help" help={t("params.tokens.help")}>
                  {t("params.tokens")}
                </HelpTip>
                <div
                  className="parameter-select"
                  data-value={
                    session.selectedTokenOption
                      ? t(session.selectedTokenOption.labelKey, {
                          tokens: session.selectedTokenOption.value,
                        })
                      : ""
                  }
                >
                  <select
                    aria-label={t("params.tokens.max")}
                    aria-describedby="tokens-help"
                    value={
                      session.selectedTokenOption?.value ??
                      session.parameters.maxTokens
                    }
                    onChange={(event) =>
                      session.handleParameterChange(
                        "maxTokens",
                        Number(event.currentTarget.value),
                      )
                    }
                  >
                    {session.tokenOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey, { tokens: option.value })}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </div>
              </div>
              <label
                className="temperature-slider"
                style={
                  {
                    "--temperature-progress": `${temperatureProgress}%`,
                  } as CSSProperties
                }
              >
                <span className="temperature-slider__header">
                  <HelpTip
                    id="temperature-help"
                    help={t("params.temperature.help")}
                  >
                    {t("params.temperature")}
                  </HelpTip>
                  <span className="temperature-slider__value" aria-hidden="true">
                    {formatTemperature(session.parameters.temperature)}
                  </span>
                </span>
                <span className="temperature-slider__control">
                  <span className="temperature-slider__bound" aria-hidden="true">
                    {String(REVIEW_CONFIG.temperature.min)}
                  </span>
                  <input
                    aria-label={t("params.temperature")}
                    aria-describedby="temperature-help"
                    type="range"
                    min={REVIEW_CONFIG.temperature.min}
                    max={REVIEW_CONFIG.temperature.max}
                    step={REVIEW_CONFIG.temperature.step}
                    value={session.parameters.temperature}
                    onChange={(event) =>
                      session.handleParameterChange(
                        "temperature",
                        event.currentTarget.valueAsNumber,
                      )
                    }
                  />
                  <span className="temperature-slider__bound" aria-hidden="true">
                    {String(REVIEW_CONFIG.temperature.max)}
                  </span>
                </span>
              </label>
            </fieldset>
          )}
        </div>
      </section>

      <section className="workspace" id="review">
        <div className="panel editor-panel">
          <div className="panel__header">
            <div className="panel__title">
              <FileCode2 size={17} />
              <span>{t("editor.title")}</span>
            </div>
            <div className="editor-actions">
              <LanguageSelect
                ariaLabel={t("editor.exampleLanguage")}
                value={session.language}
                onChange={session.handleLanguageChange}
              />
              <button
                className="editor-action-button"
                type="button"
                onClick={handleUploadClick}
              >
                <Upload size={13} />
                {t("editor.upload")}
              </button>
              <input
                accept={CODE_FILE_ACCEPT}
                aria-hidden="true"
                hidden
                ref={fileInputRef}
                tabIndex={-1}
                type="file"
                onChange={(event) => void handleFileSelected(event)}
              />
              <button
                className="editor-action-button"
                type="button"
                disabled={!session.code}
                onClick={session.clearEditor}
              >
                {t("editor.clear")}
              </button>
              {session.isReviewing ? (
                <button
                  className="editor-action-button"
                  type="button"
                  onClick={session.handleCancelReview}
                >
                  <Square size={13} fill="currentColor" />
                  {t("editor.cancel")}
                </button>
              ) : session.canContinueReview ? (
                <>
                  <button
                    className="editor-action-button"
                    type="button"
                    disabled={!session.code.trim()}
                    onClick={() => void session.handleReview()}
                  >
                    {t("editor.run")}
                  </button>
                  <button
                    className="run-button"
                    type="button"
                    onClick={session.handleContinueReview}
                  >
                    <Play size={15} fill="currentColor" />
                    {t("editor.continue")}
                  </button>
                </>
              ) : (
                <button
                  className="run-button"
                  type="button"
                  disabled={!session.code.trim()}
                  onClick={() => void session.handleReview()}
                >
                  <Play size={15} fill="currentColor" />
                  {t("editor.run")}
                </button>
              )}
            </div>
          </div>

          <div className="editor-wrap">
            <CodeMirror
              aria-label={t("editor.codeAria")}
              value={session.code}
              height="100%"
              extensions={editorExtensions}
              placeholder={t("editor.placeholder")}
              onCreateEditor={(view) => {
                editorViewRef.current = view;
              }}
              onChange={(nextCode) => session.setCode(nextCode)}
              basicSetup={{
                foldGutter: false,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                autocompletion: true,
                bracketMatching: true,
              }}
            />
          </div>

          <div className="editor-footer">
            <span>
              {t("editor.counts", {
                language: LANGUAGE_LABELS[session.language],
                lines: session.lineCount,
                characters: session.code.length,
              })}
            </span>
          </div>
        </div>

        <div className="panel result-panel" aria-live="polite">
          <div className="panel__header">
            <div className="panel__title">
              <ShieldCheck size={18} />
              <span>{t("results.title")}</span>
            </div>
            {session.result && !session.isReviewing && !session.result.partial && (
              <div className="status-badge">
                <CheckCircle2 size={13} />
                {t("results.analyzed", {
                  seconds: (session.result.durationMs / 1000).toFixed(1),
                })}
              </div>
            )}
            {session.isReviewing &&
              (session.result?.partial ||
                Boolean(session.modelProgress?.streamedText)) && (
                <div className="status-badge is-generating">
                  <LoaderCircle className="spin" size={13} />
                  {t("results.generating")}
                </div>
              )}
            <div className="result-panel__actions">
              {session.result && !session.isReviewing && !session.result.partial && (
                <button
                  className="editor-action-button"
                  type="button"
                  disabled={session.isSaving}
                  onClick={() => void handleSave()}
                >
                  {session.isSaving ? (
                    <LoaderCircle className="spin" size={13} />
                  ) : (
                    <Save size={13} />
                  )}
                  {session.isSaving ? t("results.saving") : t("results.save")}
                </button>
              )}
            </div>
          </div>

          <div
            className={`result-panel__content${
              (waitingForOutput && session.modelProgress?.streamedText) ||
              (session.canContinueReview &&
                !session.isReviewing &&
                !session.result)
                ? " is-streaming"
                : ""
            }`}
          >
            {waitingForOutput ? (
              <div
                className={
                  session.modelProgress?.streamedText
                    ? "reviewing-state has-stream"
                    : browserLoading || browserReviewing
                      ? "reviewing-state has-status"
                      : "reviewing-state"
                }
              >
                <div className="scan-mark" aria-hidden="true">
                  <span className="scan-mark__ring" />
                  <span className="scan-mark__ring" />
                  <div className="scan-mark__core">
                    <LoadingStars />
                    <span className="scan-mark__glow" />
                  </div>
                  <span className="scan-mark__dot" />
                  <span className="scan-mark__dot" />
                  <span className="scan-mark__dot" />
                </div>
                <h2>
                  {session.modelProgress &&
                  session.modelProgress.progress < 1
                    ? t("browser.loading", {
                        model: session.selectedBrowserModel?.label ?? REVIEW_CONFIG.model.label,
                      })
                    : session.modelProgress?.streamedText
                      ? t("browser.generating")
                      : session.isPreloading
                        ? t("browser.loading", {
                            model:
                              session.selectedBrowserModel?.label ??
                              REVIEW_CONFIG.model.label,
                          })
                        : t("browser.reviewing")}
                </h2>
                {!browserLoading && !browserReviewing ? (
                  <p>
                    {session.modelProgress?.streamedText
                      ? t("results.generating")
                      : t("results.reviewingBody")}
                  </p>
                ) : null}
                {(browserLoading ||
                  (session.modelProgress &&
                    session.modelProgress.progress < 1)) && (
                  <div
                    className="model-progress"
                    role="progressbar"
                    aria-label={t("browser.loading", {
                      model:
                        session.selectedBrowserModel?.label ??
                        REVIEW_CONFIG.model.label,
                    })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      (session.modelProgress?.progress ?? 0) * 100,
                    )}
                  >
                    <span
                      style={{
                        width: `${Math.round((session.modelProgress?.progress ?? 0) * 100)}%`,
                      }}
                    />
                  </div>
                )}
                {browserLoading ? (
                  <BrowserLoadingStatus
                    model={session.selectedBrowserModel}
                    progress={session.modelProgress}
                  />
                ) : null}
                {browserReviewing ? (
                  <BrowserReviewingStatus
                    model={session.selectedBrowserModel}
                    progress={session.modelProgress}
                    languageLabel={LANGUAGE_LABELS[session.language]}
                    lineCount={session.lineCount}
                    characterCount={session.code.length}
                    temperature={session.parameters.temperature}
                  />
                ) : null}
                {session.modelProgress?.streamedText && (
                  <StreamPreview text={session.modelProgress.streamedText} />
                )}
              </div>
            ) : session.canContinueReview ? (
              <div
                className={
                  session.result
                    ? "interrupted-review has-partial"
                    : "interrupted-review has-stream"
                }
              >
                <div className="interrupted-review__banner">
                  <h2>{t("results.interruptedTitle")}</h2>
                  <p>{t("results.interruptedBody")}</p>
                  <button
                    className="run-button"
                    type="button"
                    onClick={session.handleContinueReview}
                  >
                    <Play size={15} fill="currentColor" />
                    {t("editor.continue")}
                  </button>
                </div>
                {session.result ? (
                  <ReviewResults
                    result={session.result}
                    interrupted
                  />
                ) : (
                  <StreamPreview text={session.interruptedOutput ?? ""} />
                )}
              </div>
            ) : session.result ? (
              <ReviewResults result={session.result} />
            ) : session.reviewErrorKind === "webgpu" ? (
              <div className="empty-state review-error-state webgpu-help-state">
                <div className="empty-state__icon">
                  <Cpu size={27} strokeWidth={1.35} />
                </div>
                <h2>{t("gpu.unavailable.title")}</h2>
                <p>{t("gpu.unavailable.body")}</p>
                <ol className="webgpu-help-state__steps">
                  <li>{t("gpu.unavailable.https")}</li>
                  <li>{t("gpu.unavailable.chrome")}</li>
                  <li>{t("gpu.unavailable.brave")}</li>
                  <li>{t("gpu.unavailable.firefox")}</li>
                  <li>{t("gpu.unavailable.safari")}</li>
                </ol>
              </div>
            ) : session.reviewError ? (
              <div className="empty-state review-error-state">
                <div className="empty-state__icon">
                  <ShieldCheck size={27} strokeWidth={1.35} />
                </div>
                <h2>{t("results.errorTitle")}</h2>
                <p>{session.reviewError}</p>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">
                  {session.isBrowserReady ? (
                    <Cpu size={27} strokeWidth={1.35} />
                  ) : (
                    <ShieldCheck size={27} strokeWidth={1.35} />
                  )}
                </div>
                <h2>
                  {session.isBrowserReady
                    ? t("browser.ready")
                    : t("results.emptyTitle")}
                </h2>
                <p>
                  {session.isBrowserReady
                    ? t("browser.readyBody")
                    : t("results.emptyBody")}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export function ReviewPage() {
  return <ReviewWorkspace />;
}
