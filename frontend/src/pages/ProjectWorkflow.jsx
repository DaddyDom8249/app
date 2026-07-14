import React, { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProject, upsertProject, fileToDataUrl } from "@/lib/storage";
import { styleLabel, refTypeLabel, MOTION_TYPES } from "@/lib/constants";
import {
  generateWorldReport,
  generateWorldAssets,
  generateStoryboard,
  generateScenePrompts,
  generateSceneImage,
  fetchProviderStatus,
} from "@/lib/api";
import ReferencePhotoUploader from "@/components/ReferencePhotoUploader";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  Lock,
  Copy,
  Upload,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";

// ----------- Helpers -----------
function Section({ num, title, badge, children, testid }) {
  return (
    <section className="bv-card p-6 md:p-8" data-testid={testid}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <div className="stage-num">{String(num).padStart(2, "0")}</div>
          <div>
            <div className="overline text-neutral-500">Stage</div>
            <h2 className="font-display text-2xl md:text-3xl uppercase leading-tight">{title}</h2>
          </div>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function FieldRow({ label, value }) {
  if (!value && value !== 0) return null;
  const isArr = Array.isArray(value);
  return (
    <div className="border-t border-white/5 py-3">
      <div className="overline text-neutral-500 mb-1">{label}</div>
      {isArr ? (
        <ul className="list-disc list-inside space-y-1 text-neutral-200 font-body text-sm">
          {value.map((v, i) => (
            <li key={i}>{typeof v === "string" ? v : JSON.stringify(v)}</li>
          ))}
        </ul>
      ) : typeof value === "object" ? (
        <pre className="font-mono text-xs text-neutral-300 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
      ) : (
        <div className="text-neutral-200 font-body text-sm leading-relaxed">{String(value)}</div>
      )}
    </div>
  );
}

// ----------- Main Page -----------
export default function ProjectWorkflow() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState({});
  const [providerStatus, setProviderStatus] = useState(null);

  useEffect(() => {
    const p = getProject(id);
    if (!p) {
      toast.error("Project not found");
      nav("/dashboard");
      return;
    }
    setProject(p);
    fetchProviderStatus().then(setProviderStatus).catch(() => setProviderStatus(null));
  }, [id, nav]);

  function persist(patch) {
    setProject((prev) => {
      const next = { ...prev, ...patch };
      upsertProject(next);
      return next;
    });
  }

  function setLoad(k, v) {
    setLoading((l) => ({ ...l, [k]: v }));
  }

  const imageProviderReady = providerStatus?.image_generation?.connected;

  if (!project) return null;

  const worldReportBadge = project.worldReportApproved ? (
    <StatusBadge status="approved" testid="stage-badge-world" />
  ) : project.worldReport ? (
    <StatusBadge status="ready" testid="stage-badge-world" />
  ) : (
    <StatusBadge status="missing" testid="stage-badge-world" />
  );

  const assetsApproved =
    project.styleBibleApproved && project.characterSheetApproved && project.environmentSheetApproved;
  const assetsBadge = !project.worldReportApproved ? (
    <StatusBadge status="locked" testid="stage-badge-assets" />
  ) : assetsApproved ? (
    <StatusBadge status="approved" testid="stage-badge-assets" />
  ) : project.styleBible ? (
    <StatusBadge status="ready" testid="stage-badge-assets" />
  ) : (
    <StatusBadge status="missing" testid="stage-badge-assets" />
  );

  const storyboardBadge = !assetsApproved ? (
    <StatusBadge status="locked" testid="stage-badge-story" />
  ) : project.storyboardApproved ? (
    <StatusBadge status="approved" testid="stage-badge-story" />
  ) : project.storyboardScenes ? (
    <StatusBadge status="ready" testid="stage-badge-story" />
  ) : (
    <StatusBadge status="missing" testid="stage-badge-story" />
  );

  const promptsBadge = !project.storyboardApproved ? (
    <StatusBadge status="locked" testid="stage-badge-prompts" />
  ) : project.scenePromptsApproved ? (
    <StatusBadge status="approved" testid="stage-badge-prompts" />
  ) : project.scenePrompts ? (
    <StatusBadge status="ready" testid="stage-badge-prompts" />
  ) : (
    <StatusBadge status="missing" testid="stage-badge-prompts" />
  );

  const approvedImagesCount = Object.values(project.sceneImages || {}).filter((s) => s?.approved).length;

  // ---------- Handlers ----------
  async function doWorldReport() {
    setLoad("world", true);
    try {
      const report = await generateWorldReport(project);
      persist({ worldReport: report, worldReportApproved: false });
      toast.success("Visual World Report generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Failed to generate report");
    } finally {
      setLoad("world", false);
    }
  }

  async function doWorldAssets() {
    setLoad("assets", true);
    try {
      const data = await generateWorldAssets(project);
      persist({
        styleBible: data.world_style_bible,
        characterSheet: data.character_sheet,
        environmentSheet: data.environment_sheet,
        styleBibleApproved: false,
        characterSheetApproved: false,
        environmentSheetApproved: false,
      });
      toast.success("World Assets generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Failed to generate assets");
    } finally {
      setLoad("assets", false);
    }
  }

  async function doStoryboard() {
    setLoad("story", true);
    try {
      const data = await generateStoryboard(project);
      persist({ storyboardScenes: data.scenes, storyboardApproved: false });
      toast.success("Storyboard generated (8 scenes)");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Failed to generate storyboard");
    } finally {
      setLoad("story", false);
    }
  }

  async function doScenePrompts() {
    setLoad("prompts", true);
    try {
      const data = await generateScenePrompts(project);
      persist({ scenePrompts: data.prompts, scenePromptsApproved: false });
      toast.success("Scene prompts generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Failed to generate scene prompts");
    } finally {
      setLoad("prompts", false);
    }
  }

  async function doGenerateSceneImage(sceneNumber) {
    if (!imageProviderReady) {
      toast.error("Image provider is not connected. Upload manually or connect a provider in Settings.");
      return;
    }
    setLoad(`img-${sceneNumber}`, true);
    try {
      const scene = project.storyboardScenes.find((s) => s.scene_number === sceneNumber);
      const prompt = project.scenePrompts?.find((p) => p.scene_number === sceneNumber);
      const refIds = scene?.reference_photo_ids || [];
      const refs = (project.referencePhotos || []).filter((r) => refIds.includes(r.id));
      const data = await generateSceneImage({
        projectId: project.id,
        sceneId: String(sceneNumber),
        scenePrompt: prompt?.final_polished_prompt || scene?.visual_prompt || scene?.description || "",
        stylePreset: styleLabel(project.style),
        negativePrompt: prompt?.negative_prompt || "",
        referenceImages: refs,
      });
      const sceneImages = { ...(project.sceneImages || {}) };
      sceneImages[sceneNumber] = {
        sourceType: "generated_from_reference",
        imageDataUrl: data.generatedImageBase64,
        approved: false,
        providerName: data.providerName,
        generatedAt: data.createdAt,
        referencePhotoIdsUsed: data.referencePhotoIdsUsed,
      };
      persist({ sceneImages });
      toast.success(`Scene ${sceneNumber} image generated`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Image generation failed");
    } finally {
      setLoad(`img-${sceneNumber}`, false);
    }
  }

  async function handleManualUpload(sceneNumber, file) {
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      toast.warning("Large image may not persist across sessions.");
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const sceneImages = { ...(project.sceneImages || {}) };
      sceneImages[sceneNumber] = {
        sourceType: "manual_upload",
        imageDataUrl: dataUrl,
        approved: false,
        providerName: null,
        generatedAt: new Date().toISOString(),
        referencePhotoIdsUsed: [],
      };
      persist({ sceneImages });
      toast.success(`Uploaded scene ${sceneNumber} image`);
    } catch (e) {
      toast.error("Failed to read image");
    }
  }

  function approveSceneImage(sceneNumber, approved = true) {
    const sceneImages = { ...(project.sceneImages || {}) };
    if (!sceneImages[sceneNumber]) return;
    sceneImages[sceneNumber] = { ...sceneImages[sceneNumber], approved };
    persist({ sceneImages });
  }

  function removeSceneImage(sceneNumber) {
    const sceneImages = { ...(project.sceneImages || {}) };
    delete sceneImages[sceneNumber];
    persist({ sceneImages });
  }

  const totalScenes = project.storyboardScenes?.length || 0;
  const missingImagesCount = totalScenes - approvedImagesCount;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div>
          <div className="overline text-neutral-500 mb-2">{project.artist || "Unknown Artist"}</div>
          <h1 className="font-display text-4xl md:text-6xl uppercase leading-none">{project.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="badge badge-locked"><span className="badge-dot" />{styleLabel(project.style)}</span>
            <span className="badge badge-ref-active"><span className="badge-dot" />{(project.referencePhotos || []).length} References</span>
            {!imageProviderReady && <StatusBadge status="provider_missing" label="Image Provider Missing" />}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => nav("/dashboard")} data-testid="workflow-back">
          Back to Dashboard
        </button>
      </div>

      {/* A. Reference Photo Library */}
      <Section
        num={1}
        title="Reference Photo Library"
        badge={
          (project.referencePhotos || []).length > 0 ? (
            <StatusBadge status="reference_photo_active" />
          ) : (
            <StatusBadge status="missing" />
          )
        }
        testid="section-references"
      >
        <p className="font-body text-sm text-neutral-400 mb-4">
          These photos guide every generated report, prompt, and scene image. Assign a type to each.
        </p>
        <ReferencePhotoUploader
          photos={project.referencePhotos || []}
          onChange={(referencePhotos) => persist({ referencePhotos })}
          testidPrefix="workflow-ref"
        />
        <div className="mt-4 text-xs text-neutral-500 font-mono">
          Note: Large uploaded photos may only persist during this browser session in the MVP.
        </div>
      </Section>

      {/* B. Visual World Report */}
      <Section num={2} title="Visual World Report" badge={worldReportBadge} testid="section-world-report">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className="btn-gold inline-flex items-center gap-2"
            onClick={doWorldReport}
            disabled={loading.world}
            data-testid="btn-generate-world"
          >
            {loading.world ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {project.worldReport ? "Regenerate Report" : "Generate Report"}
          </button>
          {project.worldReport && !project.worldReportApproved && (
            <button
              className="btn-ghost inline-flex items-center gap-2"
              onClick={() => { persist({ worldReportApproved: true }); toast.success("World Report approved"); }}
              data-testid="btn-approve-world"
            >
              <CheckCircle2 className="w-4 h-4" /> Approve
            </button>
          )}
          {project.worldReportApproved && (
            <button
              className="btn-ghost"
              onClick={() => persist({ worldReportApproved: false })}
              data-testid="btn-unapprove-world"
            >
              Unapprove
            </button>
          )}
        </div>
        {project.worldReport ? (
          <div className="bg-black/40 border border-white/5 p-5">
            <FieldRow label="Logline" value={project.worldReport.logline} />
            <FieldRow label="Mood" value={project.worldReport.mood} />
            <FieldRow label="Visual World Setting" value={project.worldReport.visual_world_setting} />
            <FieldRow label="Main Protagonist" value={project.worldReport.main_protagonist} />
            <FieldRow label="Visual Conflict" value={project.worldReport.visual_conflict} />
            <FieldRow label="Core Emotional Themes" value={project.worldReport.core_emotional_themes} />
            <FieldRow label="Color Palette" value={project.worldReport.color_palette} />
            <FieldRow label="Symbols" value={project.worldReport.symbols} />
            <FieldRow label="Camera Language" value={project.worldReport.camera_language} />
            <FieldRow
              label="Seven Story Beats"
              value={(project.worldReport.seven_story_beats || []).map((b) => `${b.beat}. ${b.title} — ${b.description}`)}
            />
            <FieldRow label="AI Visual Direction Prompt" value={project.worldReport.ai_visual_direction_prompt} />
            <FieldRow label="Creator Memory Style Note" value={project.worldReport.creator_memory_style_note} />
            <FieldRow label="Reference Photo Influence" value={project.worldReport.reference_photo_influence} />
            <FieldRow label="Approval Questions" value={project.worldReport.approval_questions} />
          </div>
        ) : (
          <div className="text-sm text-neutral-500 font-body">No report yet. Click Generate.</div>
        )}
      </Section>

      {/* C. World Assets */}
      <Section
        num={3}
        title="World Assets"
        badge={assetsBadge}
        testid="section-world-assets"
      >
        {!project.worldReportApproved ? (
          <div className="flex items-center gap-3 text-neutral-500 font-body text-sm">
            <Lock className="w-4 h-4" /> Approve the Visual World Report to unlock.
          </div>
        ) : (
          <>
            <div className="mb-5">
              <button
                className="btn-gold inline-flex items-center gap-2"
                onClick={doWorldAssets}
                disabled={loading.assets}
                data-testid="btn-generate-assets"
              >
                {loading.assets ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {project.styleBible ? "Regenerate Assets" : "Generate Assets"}
              </button>
            </div>
            {project.styleBible && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AssetCard
                  title="World Style Bible"
                  data={project.styleBible}
                  approved={project.styleBibleApproved}
                  onApprove={() => persist({ styleBibleApproved: !project.styleBibleApproved })}
                  testid="asset-style"
                />
                <AssetCard
                  title="Character Sheet"
                  data={project.characterSheet}
                  approved={project.characterSheetApproved}
                  onApprove={() => persist({ characterSheetApproved: !project.characterSheetApproved })}
                  testid="asset-character"
                />
                <AssetCard
                  title="Environment Sheet"
                  data={project.environmentSheet}
                  approved={project.environmentSheetApproved}
                  onApprove={() => persist({ environmentSheetApproved: !project.environmentSheetApproved })}
                  testid="asset-environment"
                />
              </div>
            )}
          </>
        )}
      </Section>

      {/* D. Storyboard */}
      <Section num={4} title="Storyboard" badge={storyboardBadge} testid="section-storyboard">
        {!assetsApproved ? (
          <div className="flex items-center gap-3 text-neutral-500 font-body text-sm">
            <Lock className="w-4 h-4" /> Approve all three World Assets to unlock.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                className="btn-gold inline-flex items-center gap-2"
                onClick={doStoryboard}
                disabled={loading.story}
                data-testid="btn-generate-storyboard"
              >
                {loading.story ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {project.storyboardScenes ? "Regenerate Storyboard" : "Generate Storyboard"}
              </button>
              {project.storyboardScenes && !project.storyboardApproved && (
                <button
                  className="btn-ghost inline-flex items-center gap-2"
                  onClick={() => { persist({ storyboardApproved: true }); toast.success("Storyboard approved"); }}
                  data-testid="btn-approve-storyboard"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve Storyboard
                </button>
              )}
              {project.storyboardApproved && (
                <button className="btn-ghost" onClick={() => persist({ storyboardApproved: false })} data-testid="btn-unapprove-storyboard">
                  Unapprove
                </button>
              )}
            </div>
            {project.storyboardScenes && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.storyboardScenes.map((s, i) => (
                  <div key={i} className="bv-card p-5" data-testid={`storyboard-scene-${s.scene_number}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="stage-num">S{String(s.scene_number).padStart(2, "0")}</div>
                      <div className="overline text-neutral-500">{s.timestamp_range}</div>
                    </div>
                    <h4 className="font-display text-lg uppercase mt-2 mb-3">{s.scene_title}</h4>
                    <p className="text-sm text-neutral-300 font-body mb-3">{s.description}</p>
                    <div className="text-xs font-mono text-neutral-500 space-y-1">
                      <div><span className="text-neutral-400">Camera:</span> {s.camera_movement}</div>
                      <div><span className="text-neutral-400">Color:</span> {s.color_emphasis}</div>
                      <div><span className="text-neutral-400">Symbol:</span> {s.symbol}</div>
                    </div>
                    {s.reference_photo_ids?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {s.reference_photo_ids.map((rid) => {
                          const ref = (project.referencePhotos || []).find((r) => r.id === rid);
                          if (!ref) return null;
                          return (
                            <span key={rid} className="badge badge-ref-active"><span className="badge-dot" />{refTypeLabel(ref.type)}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {/* E. Scene Visual Prompts */}
      <Section num={5} title="Scene Visual Prompts" badge={promptsBadge} testid="section-scene-prompts">
        {!project.storyboardApproved ? (
          <div className="flex items-center gap-3 text-neutral-500 font-body text-sm">
            <Lock className="w-4 h-4" /> Approve the Storyboard to unlock.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                className="btn-gold inline-flex items-center gap-2"
                onClick={doScenePrompts}
                disabled={loading.prompts}
                data-testid="btn-generate-prompts"
              >
                {loading.prompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {project.scenePrompts ? "Regenerate Prompts" : "Generate Prompts"}
              </button>
              {project.scenePrompts && !project.scenePromptsApproved && (
                <button
                  className="btn-ghost inline-flex items-center gap-2"
                  onClick={() => { persist({ scenePromptsApproved: true }); toast.success("Scene prompts approved"); }}
                  data-testid="btn-approve-prompts"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve All Prompts
                </button>
              )}
              {project.scenePromptsApproved && (
                <button className="btn-ghost" onClick={() => persist({ scenePromptsApproved: false })} data-testid="btn-unapprove-prompts">
                  Unapprove
                </button>
              )}
            </div>
            {project.scenePrompts && (
              <div className="space-y-3">
                {project.scenePrompts.map((p, i) => (
                  <ScenePromptCard
                    key={i}
                    p={p}
                    onEdit={(next) => {
                      const clone = [...project.scenePrompts];
                      clone[i] = next;
                      persist({ scenePrompts: clone });
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {/* F. Scene Images */}
      <Section
        num={6}
        title="Scene Images"
        badge={
          !project.scenePromptsApproved ? <StatusBadge status="locked" /> :
          approvedImagesCount === totalScenes && totalScenes > 0 ? <StatusBadge status="approved" /> :
          approvedImagesCount > 0 ? <StatusBadge status="ready" /> : <StatusBadge status="missing" />
        }
        testid="section-scene-images"
      >
        {!project.scenePromptsApproved ? (
          <div className="flex items-center gap-3 text-neutral-500 font-body text-sm">
            <Lock className="w-4 h-4" /> Approve Scene Prompts to unlock.
          </div>
        ) : (
          <>
            {!imageProviderReady && (
              <div className="mb-5 bv-card p-4 border-orange-500/30">
                <div className="flex items-center gap-2">
                  <StatusBadge status="provider_missing" />
                </div>
                <p className="mt-2 font-body text-sm text-neutral-300">
                  Image provider is not connected. BeatVision will not pretend placeholder images
                  are generated images. Upload scene images manually or connect a provider in Settings.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(project.storyboardScenes || []).map((s) => (
                <SceneImageCard
                  key={s.scene_number}
                  scene={s}
                  prompt={project.scenePrompts?.find((sp) => sp.scene_number === s.scene_number)}
                  image={project.sceneImages?.[s.scene_number]}
                  imageProviderReady={imageProviderReady}
                  loading={!!loading[`img-${s.scene_number}`]}
                  onGenerate={() => doGenerateSceneImage(s.scene_number)}
                  onUpload={(file) => handleManualUpload(s.scene_number, file)}
                  onApprove={() => approveSceneImage(s.scene_number, true)}
                  onUnapprove={() => approveSceneImage(s.scene_number, false)}
                  onRemove={() => removeSceneImage(s.scene_number)}
                />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* G. Motion / Export Plan */}
      <Section
        num={7}
        title="Motion / Export Plan"
        badge={approvedImagesCount === 0 ? <StatusBadge status="locked" /> : approvedImagesCount === totalScenes ? <StatusBadge status="ready" label="Ready" /> : <StatusBadge status="demo" label="Partial" />}
        testid="section-motion-export"
      >
        {approvedImagesCount === 0 ? (
          <div className="flex items-center gap-3 text-neutral-500 font-body text-sm">
            <Lock className="w-4 h-4" /> Approve at least one scene image to unlock.
          </div>
        ) : (
          <MotionExportPanel
            project={project}
            approvedImagesCount={approvedImagesCount}
            missingImagesCount={missingImagesCount}
            totalScenes={totalScenes}
          />
        )}
      </Section>
    </div>
  );
}

// ---------- Sub-components ----------
function AssetCard({ title, data, approved, onApprove, testid }) {
  return (
    <div className="bv-card p-5" data-testid={testid}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-display text-base uppercase leading-tight">{title}</h4>
        {approved ? <StatusBadge status="approved" /> : <StatusBadge status="ready" />}
      </div>
      <div className="text-sm space-y-2 max-h-72 overflow-auto pr-1">
        {Object.entries(data || {}).map(([k, v]) => (
          <div key={k}>
            <div className="overline text-neutral-500 mb-1">{k.replace(/_/g, " ")}</div>
            <div className="font-body text-neutral-200">
              {Array.isArray(v) ? v.join(", ") : String(v)}
            </div>
          </div>
        ))}
      </div>
      <button
        className={approved ? "btn-ghost mt-4 w-full" : "btn-gold mt-4 w-full"}
        onClick={onApprove}
        data-testid={`${testid}-approve`}
      >
        {approved ? "Unapprove" : "Approve"}
      </button>
    </div>
  );
}

function ScenePromptCard({ p, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.final_polished_prompt || "");
  useEffect(() => { setText(p.final_polished_prompt || ""); }, [p.final_polished_prompt]);
  return (
    <div className="bv-card p-5" data-testid={`prompt-card-${p.scene_number}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="overline text-neutral-500">Scene {String(p.scene_number).padStart(2, "0")}</div>
          <h4 className="font-display text-lg uppercase mt-1">{p.scene_description?.slice(0, 60)}</h4>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={() => { navigator.clipboard.writeText(p.final_polished_prompt || ""); toast.success("Prompt copied"); }}
            data-testid={`prompt-copy-${p.scene_number}`}
          >
            <Copy className="w-3 h-3 inline mr-1" /> Copy
          </button>
          <button
            className="btn-ghost"
            onClick={() => setEditing((e) => !e)}
            data-testid={`prompt-edit-${p.scene_number}`}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          className="bv-textarea"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onEdit({ ...p, final_polished_prompt: text })}
          data-testid={`prompt-textarea-${p.scene_number}`}
        />
      ) : (
        <div className="font-mono text-xs bg-black/40 p-3 whitespace-pre-wrap text-neutral-300 max-h-40 overflow-auto">
          {p.final_polished_prompt}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono text-neutral-500">
        <div><span className="text-neutral-400">Camera:</span> {p.camera_angle}</div>
        <div><span className="text-neutral-400">Lighting:</span> {p.lighting}</div>
        <div><span className="text-neutral-400">Mood:</span> {p.mood}</div>
        <div><span className="text-neutral-400">Negative:</span> {p.negative_prompt}</div>
      </div>
    </div>
  );
}

function SceneImageCard({ scene, prompt, image, imageProviderReady, loading, onGenerate, onUpload, onApprove, onUnapprove, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div className="bv-card p-4" data-testid={`scene-img-card-${scene.scene_number}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="overline text-neutral-500">Scene {String(scene.scene_number).padStart(2, "0")}</div>
          <h4 className="font-display text-base uppercase mt-1">{scene.scene_title}</h4>
        </div>
        {image?.approved && <StatusBadge status="approved" />}
      </div>
      <div className="aspect-video bg-black border border-white/5 mb-3 overflow-hidden flex items-center justify-center">
        {image?.imageDataUrl ? (
          <img src={image.imageDataUrl} alt={`Scene ${scene.scene_number}`} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-8 h-8 text-neutral-700" strokeWidth={1.2} />
        )}
      </div>
      {image && (
        <div className="text-xs font-mono text-neutral-500 mb-3">
          <div><span className="text-neutral-400">Source:</span> {image.sourceType === "manual_upload" ? "Manual upload" : `Generated · ${image.providerName || "provider"}`}</div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onUpload(e.target.files?.[0])}
          data-testid={`scene-img-file-${scene.scene_number}`}
        />
        <button
          className="btn-ghost inline-flex items-center gap-1"
          onClick={() => inputRef.current?.click()}
          data-testid={`scene-img-upload-${scene.scene_number}`}
        >
          <Upload className="w-3 h-3" /> Upload
        </button>
        <button
          className="btn-ghost inline-flex items-center gap-1"
          onClick={onGenerate}
          disabled={!imageProviderReady || loading}
          data-testid={`scene-img-generate-${scene.scene_number}`}
          title={!imageProviderReady ? "Image provider is not connected" : "Generate from reference photos"}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Generate
        </button>
        {image && !image.approved && (
          <button className="btn-gold" onClick={onApprove} data-testid={`scene-img-approve-${scene.scene_number}`}>
            Approve
          </button>
        )}
        {image?.approved && (
          <button className="btn-ghost" onClick={onUnapprove} data-testid={`scene-img-unapprove-${scene.scene_number}`}>
            Unapprove
          </button>
        )}
        {image && (
          <button className="btn-danger" onClick={onRemove} data-testid={`scene-img-remove-${scene.scene_number}`}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function MotionExportPanel({ project, approvedImagesCount, missingImagesCount, totalScenes }) {
  const [showPlan, setShowPlan] = useState(false);
  const suggestedMotion = useMemo(() => {
    return (project.storyboardScenes || []).map((s, i) => ({
      scene_number: s.scene_number,
      scene_title: s.scene_title,
      motion: MOTION_TYPES[i % MOTION_TYPES.length],
      approved: !!project.sceneImages?.[s.scene_number]?.approved,
    }));
  }, [project.storyboardScenes, project.sceneImages]);

  const complete = approvedImagesCount === totalScenes && totalScenes > 0;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Approved Scene Images</div>
          <div className="font-display text-4xl text-[#34D399] mt-2">{approvedImagesCount}</div>
        </div>
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Missing Scene Images</div>
          <div className="font-display text-4xl text-[#F87171] mt-2">{missingImagesCount}</div>
        </div>
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Status</div>
          <div className="font-display text-xl mt-2 uppercase">
            {complete ? "Ready for future motion render." : "Partial preview only."}
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        {suggestedMotion.map((m) => (
          <div key={m.scene_number} className="flex items-center justify-between border-b border-white/5 py-2 text-sm font-body">
            <span className="font-mono text-neutral-500">S{String(m.scene_number).padStart(2, "0")}</span>
            <span className="flex-1 mx-4 truncate">{m.scene_title}</span>
            <span className="text-[#E5B83B] font-mono uppercase text-xs tracking-widest">{m.motion}</span>
            {m.approved ? <StatusBadge status="approved" label="OK" /> : <StatusBadge status="missing" label="No image" />}
          </div>
        ))}
      </div>

      <button className="btn-gold" onClick={() => setShowPlan(true)} data-testid="preview-export-plan">
        Preview Export Plan
      </button>

      {showPlan && (
        <div className="mt-6 bv-card p-5" data-testid="export-plan-summary">
          <div className="overline text-neutral-500 mb-2">Export Plan Summary</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-body">
            <div><span className="text-neutral-500">Song:</span> {project.title}</div>
            <div><span className="text-neutral-500">Total Scenes:</span> {totalScenes}</div>
            <div><span className="text-neutral-500">Approved Images:</span> {approvedImagesCount}</div>
            <div><span className="text-neutral-500">Suggested Transitions:</span> {suggestedMotion.map((m) => m.motion).join(", ")}</div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 text-xs font-mono text-neutral-400">
            Future renderer requirement: Full MP4 rendering will be added later using many short clips
            stitched into one final video.
          </div>
        </div>
      )}
    </>
  );
}
