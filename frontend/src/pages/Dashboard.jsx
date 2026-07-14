import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadProjects, deleteProject, projectStatus } from "@/lib/storage";
import { styleLabel } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import { Plus, Trash2, ArrowUpRight, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL = {
  draft: "Draft",
  world_ready: "World Ready",
  storyboard_ready: "Storyboard Ready",
  prompts_ready: "Prompts Ready",
  in_production: "In Production",
};

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    deleteProject(id);
    setProjects(loadProjects());
    toast.success("Project deleted");
  }

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-16">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div>
          <div className="overline text-neutral-500 mb-2">Your Projects</div>
          <h1 className="font-display text-4xl md:text-5xl uppercase leading-none">Dashboard</h1>
          <p className="mt-3 font-serif-italic italic text-lg text-neutral-400">
            Every song you&apos;ve started revealing.
          </p>
        </div>
        <button
          className="btn-gold inline-flex items-center gap-2 self-start"
          onClick={() => nav("/new")}
          data-testid="dashboard-new-project"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bv-card p-12 text-center" data-testid="dashboard-empty">
          <ImageIcon className="w-8 h-8 mx-auto mb-4 text-neutral-600" strokeWidth={1.5} />
          <div className="font-display text-2xl uppercase mb-2">No projects yet</div>
          <p className="text-neutral-400 mb-6 font-body">
            Start your first project — reveal the world behind your first song.
          </p>
          <Link to="/new">
            <button className="btn-gold" data-testid="empty-new-project">Start a Project</button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const st = projectStatus(p);
            const refCount = (p.referencePhotos || []).length;
            return (
              <div key={p.id} className="bv-card p-5 flex flex-col" data-testid={`project-card-${i}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="overline text-neutral-500 truncate">{p.artist || "Unknown Artist"}</div>
                    <h3 className="font-display text-2xl uppercase leading-tight mt-1 truncate">{p.title}</h3>
                  </div>
                  <StatusBadge status="ready" label={STATUS_LABEL[st] || st} testid={`project-status-${i}`} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge badge-locked"><span className="badge-dot" />{styleLabel(p.style)}</span>
                  {refCount > 0 && (
                    <span className="badge badge-ref-active"><span className="badge-dot" />{refCount} Reference{refCount === 1 ? "" : "s"}</span>
                  )}
                </div>
                <div className="mt-4 text-xs text-neutral-500 font-mono">
                  Updated {new Date(p.updatedAt || p.createdAt).toLocaleString()}
                </div>
                <div className="mt-5 flex gap-2 pt-4 border-t border-white/5">
                  <button
                    className="btn-gold flex-1 inline-flex items-center justify-center gap-2"
                    onClick={() => nav(`/project/${p.id}`)}
                    data-testid={`project-open-${i}`}
                  >
                    Open <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => handleDelete(p.id, p.title)}
                    data-testid={`project-delete-${i}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
