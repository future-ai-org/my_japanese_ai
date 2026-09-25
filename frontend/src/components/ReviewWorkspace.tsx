import { useEffect, useMemo, useRef, type ChangeEvent, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Cpu,
  FileCode2,
  LoaderCircle,
  Play,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Upload,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { BrowserLoadingStatus } from "./BrowserLoadingStatus";
import { BrowserReviewingStatus } from "./BrowserReviewingStatus";
import { CloudConnectingStatus } from "./CloudConnectingStatus";
import { HelpTip } from "./HelpTip";
import { LanguageSelect } from "./LanguageSelect";
import { ModelDiagnostics } from "./ModelDiagnostics";
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
import { docPath, paths } from "../docs/paths";
import { jumpToLine } from "../editor/jumpToLine";
import { editorLanguage } from "../editor/languageSupport";
import { useLocale } from "../i18n/locale";
import { type InferenceProvider, type ReviewFinding } from "../types/review";

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
  const { t } = useLocale();
  const { user } = useSession();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const diagnosticsRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const session = useReviewSession();
  const editorExtensions = useMemo(
    () => [editorLanguage(session.language)],
    [session.language],
  );
  const temperatureProgress = temperatureFillPercent(
    session.parameters.temperature,
  );

  useEffect(() => {
    if (!session.showDiagnostics) return;
    diagnosticsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [session.showDiagnostics]);

  const handleFindingSelect = (finding: ReviewFinding) => {
    const selecting = session.selectedFinding !== finding.id;
    session.handleFindingSelect(finding);
    if (selecting && editorViewRef.current) {
      jumpToLine(editorViewRef.current, finding.line);
    }
  };

  const maxCodeCharacters =
    session.provider === "browser"
      ? (session.selectedBrowserModel?.limits.maxCodeCharacters ??
        REVIEW_CONFIG.limits.maxCodeCharacters)
      : (session.selectedCloudModel?.maxCodeCharacters ??
        REVIEW_CONFIG.limits.maxCodeCharacters);

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
  const cloudStartup =
    session.gpuStarting ||
    (session.reviewErrorKind === "startup" && !session.isReviewing);
  const waitingForOutput =
    !session.result &&
    (session.isReviewing ||
      (session.isPreloading && session.provider === "browser"));
  const browserLoading =
    session.provider === "browser" &&
    waitingForOutput &&
    !session.modelProgress?.streamedText &&
    (session.isPreloading ||
      Boolean(session.modelProgress && session.modelProgress.progress < 1));
  const browserReviewing =
    session.provider === "browser" &&
    waitingForOutput &&
    !browserLoading &&
    !session.modelProgress?.streamedText;
  const cloudConnecting =
    session.provider !== "browser" &&
    waitingForOutput &&
    !session.modelProgress?.streamedText;

  return (
    <>
      <section className="intro">
        <div className="intro__heading">
          <h1>
            {t("intro.title")}
            <br />
            <span>{t("intro.titleAccent")}</span>
          </h1>
          <p>
            {t("intro.bodyBefore")}{" "}
            <Link to={docPath("taid")}>TAID</Link>
            {t("intro.bodyAfter")}
          </p>
        </div>
        <div className="provider-summary">
          <div className="provider-summary__selects">
            <ProviderSelect
              icon={<Cloud size={15} />}
              prefix={t("provider.inference")}
              ariaLabel={t("provider.inferenceAria")}
              value={session.provider}
              displayValue={session.providerLabel}
              options={session.providerOptions}
              onChange={(next) =>
                session.handleProviderChange(next as InferenceProvider)
              }
            />
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
              <p>
                <strong>{session.selectedBrowserModel.label}</strong>{" "}
                {session.selectedBrowserModel.description
                  ? `${session.selectedBrowserModel.description} `
                  : null}
                {t("provider.browserDownload", {
                  size: session.selectedBrowserModel.downloadSizeMB.toLocaleString(),
                })}
              </p>
              <div className="provider-summary__facts">
                <HelpTip
                  id="browser-model-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.modelId.help")}
                >
                  {t("provider.modelId", { id: session.selectedBrowserModel.id })}
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
                    cache: REVIEW_CONFIG.storage.cacheBackend,
                    vram: session.selectedBrowserModel.vramRequiredMB.toLocaleString(),
                  })}
                </HelpTip>
              </div>
            </>
          ) : session.selectedCloudModel ? (
            <>
              <p>
                <strong>{session.providerLabel}</strong>{" "}
                {session.selectedCloudModel.description}
                {!user ? ` ${t("provider.signInCloud")}` : null}
              </p>
              <div className="provider-summary__facts">
                <HelpTip
                  id="cloud-model-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.modelId.help")}
                >
                  {t("provider.modelId", {
                    id: session.selectedCloudModel.modelId,
                  })}
                </HelpTip>
                <HelpTip
                  id="cloud-limit-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.limit.help")}
                >
                  {t("provider.limit", {
                    size: session.selectedCloudModel.maxCodeCharacters.toLocaleString(),
                  })}
                </HelpTip>
                <HelpTip
                  id="cloud-timeout-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.timeout.help")}
                >
                  {t("provider.timeout", {
                    seconds: (
                      session.selectedCloudModel.timeoutMs / 1000
                    ).toLocaleString(),
                  })}
                </HelpTip>
                <HelpTip
                  id="cloud-quota-help"
                  className="provider-summary__fact"
                  tabIndex={0}
                  help={t("provider.quota.help")}
                >
                  {t("provider.quota", {
                    count: session.selectedCloudModel.requestsPerWindow,
                    minutes: session.selectedCloudModel.rateLimitWindowMinutes,
                  })}
                </HelpTip>
              </div>
            </>
          ) : session.provider !== "browser" &&
            !session.cloudProviders.find(
              (candidate) => candidate.id === session.provider,
            ) ? (
            <p>{t("provider.loading")}</p>
          ) : null}
          {session.showModelDetails && (
            <fieldset
              className="inference-parameters"
              disabled={session.isReviewing}
            >
              <legend>
                <SlidersHorizontal size={13} />
                {t("params.legend")}
              </legend>
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
              <button
                className={
                  session.showDiagnostics
                    ? "editor-action-button is-active"
                    : "editor-action-button"
                }
                type="button"
                aria-pressed={session.showDiagnostics}
                disabled={!session.canOpenDiagnostics}
                onClick={() =>
                  session.setShowDiagnostics((open) => !open)
                }
              >
                <Activity size={13} />
                {t("results.diagnostics")}
              </button>
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
                    : browserLoading || browserReviewing || cloudConnecting
                      ? "reviewing-state has-status"
                      : "reviewing-state"
                }
              >
                <div className="scan-mark" aria-hidden="true">
                  <span className="scan-mark__ring" />
                  <span className="scan-mark__ring" />
                  <div className="scan-mark__core">
                    <BrandMark compact />
                    <span className="scan-mark__glow" />
                  </div>
                  <span className="scan-mark__dot" />
                  <span className="scan-mark__dot" />
                  <span className="scan-mark__dot" />
                </div>
                <h2>
                  {session.provider === "browser" &&
                  session.modelProgress &&
                  session.modelProgress.progress < 1
                    ? t("browser.loading", {
                        model: session.selectedBrowserModel?.label ?? REVIEW_CONFIG.model.label,
                      })
                    : session.provider === "browser" && session.modelProgress?.streamedText
                      ? t("browser.generating")
                      : session.provider === "browser"
                        ? session.isPreloading
                          ? t("browser.loading", {
                              model:
                                session.selectedBrowserModel?.label ??
                                REVIEW_CONFIG.model.label,
                            })
                          : t("browser.reviewing")
                        : cloudStartup
                          ? t("cloud.startupTitle")
                          : t("cloud.connecting")}
                </h2>
                {!browserLoading &&
                !browserReviewing &&
                !cloudConnecting ? (
                  <p>
                    {session.modelProgress?.streamedText
                      ? t("results.generating")
                      : (session.modelProgress?.text ?? t("results.reviewingBody"))}
                  </p>
                ) : null}
                {session.provider === "browser" &&
                  (browserLoading ||
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
                    logs={session.modelLogs}
                  />
                ) : null}
                {browserReviewing ? (
                  <BrowserReviewingStatus
                    model={session.selectedBrowserModel}
                    progress={session.modelProgress}
                    logs={session.modelLogs}
                    languageLabel={LANGUAGE_LABELS[session.language]}
                    lineCount={session.lineCount}
                    characterCount={session.code.length}
                    temperature={session.parameters.temperature}
                  />
                ) : null}
                {cloudConnecting ? (
                  <CloudConnectingStatus
                    provider={session.selectedCloudModel}
                    progress={session.modelProgress}
                    logs={session.modelLogs}
                    starting={cloudStartup}
                  />
                ) : null}
                {session.provider === "browser" &&
                  session.modelProgress?.streamedText && (
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
                    selectedFinding={session.selectedFinding}
                    interrupted
                    onSelectFinding={handleFindingSelect}
                  />
                ) : (
                  <StreamPreview text={session.interruptedOutput ?? ""} />
                )}
              </div>
            ) : session.result ? (
              <ReviewResults
                result={session.result}
                selectedFinding={session.selectedFinding}
                onSelectFinding={handleFindingSelect}
              />
            ) : session.reviewErrorKind === "startup" ? (
              <div className="empty-state gpu-startup-state">
                <div className="empty-state__icon">
                  <Cloud size={27} strokeWidth={1.35} />
                </div>
                <h2>{t("cloud.startupFailedTitle")}</h2>
                <p>{session.reviewError ?? t("cloud.startupFailedBody")}</p>
                <button
                  className="run-button"
                  type="button"
                  onClick={() => void session.handleReview()}
                >
                  {t("cloud.retry")}
                </button>
              </div>
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
      {session.showDiagnostics && (
        <div ref={diagnosticsRef}>
          <ModelDiagnostics
            provider={session.provider}
            entries={session.modelLogs}
            onClose={() => session.setShowDiagnostics(false)}
          />
        </div>
      )}
    </>
  );
}

export function ReviewPage() {
  return <ReviewWorkspace />;
}
