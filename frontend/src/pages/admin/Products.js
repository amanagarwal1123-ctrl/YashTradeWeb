import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, ChevronLeft, ChevronRight, Loader2, ImagePlus, Trash2, X, Pin, Sparkles, TrendingUp,
  EyeOff, RefreshCw, Gem, ImageOff, Save, ScanLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errMsg } from "@/lib/api";
import { AppAccessBanner, useCanWrite } from "@/components/admin/AppAccessBanner";
import { toast } from "sonner";

const okBadge = "border-emerald-200 bg-emerald-50 text-emerald-700";
const warnBadge = "border-amber-200 bg-amber-50 text-amber-700";
const mutedBadge = "border-slate-200 bg-slate-50 text-slate-600";
const STOCK = { in_stock: { t: "In stock", c: okBadge }, limited: { t: "Limited", c: warnBadge }, out_of_stock: { t: "Out of stock", c: "border-red-200 bg-red-50 text-[#C21F2B]" } };
const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** All images of a product: uploaded gallery photos (removable) + the catalogue scan the app keeps in storage. */
export const productImages = (p, appBase) => {
  const out = (p?.images || []).filter((u) => typeof u === "string" && u).map((u) => ({ url: u, kind: "gallery", removable: true }));
  const scan = p?.thumbnail_path || p?.storage_path;
  if (scan) out.push({ url: `${appBase}/api/files/${scan}`, full: `${appBase}/api/files/${p.storage_path || scan}`, kind: "catalogue", removable: false });
  return out;
};

const Thumb = ({ p, appBase, className = "" }) => {
  const [broken, setBroken] = useState(false);
  const imgs = productImages(p, appBase);
  if (!imgs.length || broken) {
    return <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}><ImageOff className="h-8 w-8" /></div>;
  }
  return <img src={imgs[0].url} alt={p.title} loading="lazy" onError={() => setBroken(true)} className={`object-cover ${className}`} />;
};

const emptyForm = {
  title: "", description: "", metal_type: "silver", category: "", subcategory: "", approx_weight: "", purity: "", selling_touch: "",
  selling_label: "", stock_status: "in_stock", tags: "", video_url: "", is_pinned: false, is_new_arrival: true, is_trending: false, visibility: "all",
};
const toForm = (p) => ({ ...emptyForm, ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, p?.[k] ?? emptyForm[k]])), tags: (p?.tags || []).join(", ") });
const fromForm = (f) => ({ ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) });

function ProductFields({ form, setForm, cats, disabled }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Title</Label>
        <Input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={150} disabled={disabled} className="h-10" data-testid="admin-product-form-title" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Description</Label>
        <Textarea value={form.description} onChange={(e) => set("description")(e.target.value)} rows={3} disabled={disabled} data-testid="admin-product-form-description" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Metal</Label>
          <Select value={form.metal_type} onValueChange={set("metal_type")} disabled={disabled}>
            <SelectTrigger className="h-10" data-testid="admin-product-form-metal"><SelectValue /></SelectTrigger>
            <SelectContent>{(cats.metal_types?.length ? cats.metal_types : ["silver", "gold"]).map((m) => <SelectItem key={m} value={m}>{titleCase(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Category</Label>
          <Select value={form.category || "__none"} onValueChange={(v) => set("category")(v === "__none" ? "" : v)} disabled={disabled}>
            <SelectTrigger className="h-10" data-testid="admin-product-form-category"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— None —</SelectItem>
              {(cats.categories || []).map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Sub-category</Label>
          <Input value={form.subcategory} onChange={(e) => set("subcategory")(e.target.value)} disabled={disabled} className="h-10" data-testid="admin-product-form-subcategory" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Stock</Label>
          <Select value={form.stock_status} onValueChange={set("stock_status")} disabled={disabled}>
            <SelectTrigger className="h-10" data-testid="admin-product-form-stock"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(STOCK).map(([k, v]) => <SelectItem key={k} value={k}>{v.t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Approx. weight</Label>
          <Input value={form.approx_weight} onChange={(e) => set("approx_weight")(e.target.value)} placeholder="e.g. 45 g" disabled={disabled} className="h-10 font-mono-nums" data-testid="admin-product-form-weight" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Purity</Label>
          <Input value={form.purity} onChange={(e) => set("purity")(e.target.value)} placeholder="e.g. 92.5" disabled={disabled} className="h-10 font-mono-nums" data-testid="admin-product-form-purity" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Selling touch</Label>
          <Input value={form.selling_touch} onChange={(e) => set("selling_touch")(e.target.value)} disabled={disabled} className="h-10 font-mono-nums" data-testid="admin-product-form-touch" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Selling label</Label>
          <Input value={form.selling_label} onChange={(e) => set("selling_label")(e.target.value)} disabled={disabled} className="h-10" data-testid="admin-product-form-label" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Tags <span className="font-normal text-slate-400">(comma separated)</span></Label>
        <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="payal, festive, gifting" disabled={disabled} className="h-10" data-testid="admin-product-form-tags" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Video URL <span className="font-normal text-slate-400">(optional)</span></Label>
        <Input value={form.video_url} onChange={(e) => set("video_url")(e.target.value)} placeholder="https://…" disabled={disabled} className="h-10" data-testid="admin-product-form-video" />
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3">
        {[["is_pinned", "Pinned", Pin], ["is_new_arrival", "New arrival", Sparkles], ["is_trending", "Trending", TrendingUp]].map(([k, label, Icon]) => (
          <label key={k} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-700"><Icon className="h-3.5 w-3.5" /> {label}</span>
            <Switch checked={!!form[k]} onCheckedChange={set(k)} disabled={disabled} data-testid={`admin-product-form-${k}`} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-slate-700"><EyeOff className="h-3.5 w-3.5" /> Hidden in app</span>
          <Switch checked={form.visibility === "hidden"} onCheckedChange={(v) => set("visibility")(v ? "hidden" : "all")} disabled={disabled} data-testid="admin-product-form-hidden" />
        </label>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const canWrite = useCanWrite();
  const [data, setData] = useState({ products: [], total: 0, page: 1, pages: 1, app_base: "" });
  const [cats, setCats] = useState({ categories: [], metal_types: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [metal, setMetal] = useState("all");
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState(null);   // product open in the side panel
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const fileRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { api.get("/portal/categories").then((r) => setCats(r.data || {})).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const r = await api.get("/portal/products", { params: { page, limit: 24, search: q || undefined, category: category !== "all" ? category : undefined, metal_type: metal !== "all" ? metal : undefined, include_hidden: hidden || undefined } });
      setData(r.data);
    } catch (e) { setLoadError(errMsg(e, "Could not load products from the app")); } finally { setLoading(false); }
  }, [page, q, category, metal, hidden]);
  useEffect(() => { load(); }, [load]);

  const open = async (p) => {
    setSelected(p); setForm(toForm(p));
    try { const r = await api.get(`/portal/products/${p.id}`); setSelected(r.data); setForm(toForm(r.data)); } catch { /* keep list copy */ }
  };
  const patchList = (p) => setData((d) => ({ ...d, products: d.products.map((x) => (x.id === p.id ? { ...x, ...p } : x)) }));

  const save = async () => {
    if (form.title.trim().length < 2) return toast.error("Please enter a title");
    setSaving(true);
    try {
      const r = await api.put(`/portal/products/${selected.id}`, fromForm(form));
      setSelected(r.data); patchList(r.data);
      toast.success("Product updated in the Yash Trade App");
    } catch (e) { toast.error(errMsg(e, "Could not save")); } finally { setSaving(false); }
  };

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let added = 0;
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append("file", f);
        const up = await api.post("/portal/products/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 });
        const r = await api.post(`/portal/products/${selected.id}/images`, { url: up.data.url });
        setSelected(r.data); patchList(r.data); added += 1;
      }
      toast.success(`${added} photo${added === 1 ? "" : "s"} added`);
    } catch (e) { toast.error(errMsg(e, "Photo upload failed")); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeImage = async (url) => {
    setRemovingUrl(url);
    try {
      const r = await api.delete(`/portal/products/${selected.id}/images`, { data: { url } });
      setSelected(r.data); patchList(r.data);
      toast.success("Photo removed");
    } catch (e) { toast.error(errMsg(e, "Could not remove photo")); } finally { setRemovingUrl(""); }
  };

  const destroy = async () => {
    setSaving(true);
    try {
      await api.delete(`/portal/products/${selected.id}`);
      toast.success(`"${selected.title}" removed from the app`);
      setDeleteOpen(false); setSelected(null); load();
    } catch (e) { toast.error(errMsg(e, "Could not delete")); } finally { setSaving(false); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (createForm.title.trim().length < 2) return toast.error("Please enter a title");
    setSaving(true);
    try {
      const r = await api.post("/portal/products", fromForm(createForm));
      toast.success("Product created — now add photos");
      setCreateOpen(false); setCreateForm(emptyForm);
      setPage(1); await load();
      open(r.data);
    } catch (e2) { toast.error(errMsg(e2, "Could not create product")); } finally { setSaving(false); }
  };

  const images = useMemo(() => productImages(selected, data.app_base), [selected, data.app_base]);

  return (
    <div className="space-y-5" data-testid="admin-products-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Products</h1>
          <p className="text-sm text-slate-500">{loading ? "Loading…" : `${data.total} product${data.total === 1 ? "" : "s"} listed in the Yash Trade App`}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="gap-1.5" data-testid="admin-products-refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!canWrite} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="admin-products-add-button"><Plus className="h-4 w-4" /> Add product</Button>
        </div>
      </div>

      <AppAccessBanner readOnlyHint="You can browse the full catalogue now; adding photos and editing switch on automatically once the app enables access." />

      <Card className="rounded-xl border-slate-200">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_180px_160px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description or tag…" className="h-10 pl-10" data-testid="admin-products-search" />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="h-10" data-testid="admin-products-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{(cats.categories || []).map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={metal} onValueChange={(v) => { setMetal(v); setPage(1); }}>
            <SelectTrigger className="h-10" data-testid="admin-products-filter-metal"><SelectValue placeholder="Metal" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All metals</SelectItem>{(cats.metal_types || []).map((m) => <SelectItem key={m} value={m}>{titleCase(m)}</SelectItem>)}</SelectContent>
          </Select>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600">
            <Switch checked={hidden} onCheckedChange={(v) => { setHidden(v); setPage(1); }} data-testid="admin-products-include-hidden" /> Include hidden
          </label>
        </CardContent>
      </Card>

      {loadError ? (
        <Card className="rounded-xl border-red-200"><CardContent className="p-8 text-center space-y-3">
          <p className="text-sm font-medium text-[#C21F2B]" data-testid="admin-products-error">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
        </CardContent></Card>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}
        </div>
      ) : data.products.length === 0 ? (
        <Card className="rounded-xl border-slate-200"><CardContent className="p-12 text-center text-sm text-slate-400" data-testid="admin-products-empty">
          <Gem className="mx-auto mb-2 h-8 w-8 text-slate-300" /> No products match this filter.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-testid="admin-products-grid">
          {data.products.map((p) => {
            const st = STOCK[p.stock_status] || { t: titleCase(p.stock_status), c: mutedBadge };
            return (
              <button key={p.id} type="button" onClick={() => open(p)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B]/40" data-testid={`admin-product-card-${p.id}`}>
                <div className="relative aspect-square overflow-hidden">
                  <Thumb p={p} appBase={data.app_base} className="h-full w-full" />
                  <div className="absolute left-2 top-2 flex gap-1">
                    {p.is_pinned && <Badge className="bg-[#0B1F3B] text-[10px]"><Pin className="h-3 w-3" /></Badge>}
                    {p.visibility === "hidden" && <Badge variant="outline" className={`${mutedBadge} text-[10px] bg-white/90`}><EyeOff className="h-3 w-3" /></Badge>}
                  </div>
                  {(p.images?.length || 0) + (p.thumbnail_path ? 1 : 0) > 1 && <Badge variant="outline" className="absolute bottom-2 right-2 bg-white/90 text-[10px]">{(p.images?.length || 0) + (p.thumbnail_path ? 1 : 0)} photos</Badge>}
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="truncate text-sm font-semibold text-[#0B1F3B]" title={p.title}>{p.title}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className={`${mutedBadge} text-[10px]`}>{titleCase(p.metal_type)}</Badge>
                    {p.category && <Badge variant="outline" className={`${mutedBadge} text-[10px]`}>{titleCase(p.category)}</Badge>}
                    <Badge variant="outline" className={`${st.c} text-[10px]`}>{st.t}</Badge>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !loadError && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1" data-testid="admin-products-prev"><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="gap-1" data-testid="admin-products-next">Next <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      {/* Detail / edit panel */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="admin-product-sheet">
          {selected && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="font-heading text-[#0B1F3B]">{selected.title}</SheetTitle>
                <SheetDescription>{selected.batch_name ? `From catalogue "${selected.batch_name}" · ` : ""}{selected.views ?? 0} views in app</SheetDescription>
              </SheetHeader>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0B1F3B]">Photos <span className="font-normal text-slate-400">({images.length})</span></h3>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} data-testid="admin-product-photo-input" />
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={!canWrite || uploading} className="gap-1.5" data-testid="admin-product-add-photo-button">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Add photos
                  </Button>
                </div>
                {images.length === 0 ? (
                  <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400" data-testid="admin-product-no-photos">No photos yet</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((im) => (
                      <div key={im.url} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50" data-testid="admin-product-photo">
                        <a href={im.full || im.url} target="_blank" rel="noreferrer"><img src={im.url} alt="" className="h-full w-full object-cover" /></a>
                        {im.removable ? (
                          <Button size="icon" variant="secondary" onClick={() => removeImage(im.url)} disabled={!canWrite || removingUrl === im.url} className="absolute right-1 top-1 h-7 w-7 bg-white/90 text-[#C21F2B] hover:bg-white" aria-label="Remove photo" data-testid="admin-product-remove-photo">
                            {removingUrl === im.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          </Button>
                        ) : (
                          <TooltipProvider delayDuration={100}><Tooltip>
                            <TooltipTrigger asChild><span className="absolute left-1 top-1 rounded bg-white/90 p-1 text-slate-600"><ScanLine className="h-3.5 w-3.5" /></span></TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">Catalogue scan imported from PDF by the app. It stays with the product; delete the product to remove it.</TooltipContent>
                          </Tooltip></TooltipProvider>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[#0B1F3B]">Details</h3>
                <ProductFields form={form} setForm={setForm} cats={cats} disabled={!canWrite} />
              </section>

              <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
                <Button variant="ghost" onClick={() => setDeleteOpen(true)} disabled={!canWrite || saving} className="gap-1.5 text-[#C21F2B] hover:bg-red-50 hover:text-[#C21F2B]" data-testid="admin-product-delete-button"><Trash2 className="h-4 w-4" /> Delete product</Button>
                <Button onClick={save} disabled={!canWrite || saving} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold min-w-[130px]" data-testid="admin-product-save-button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save changes</>}</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent data-testid="admin-product-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-[#0B1F3B]">Delete "{selected?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>The product disappears from the Yash Trade App for all customers. This cannot be undone from here.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="admin-product-delete-cancel">Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); destroy(); }} disabled={saving} className="bg-[#C21F2B] hover:bg-[#a51a24] font-semibold" data-testid="admin-product-delete-confirm">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete product"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="admin-product-create-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-[#0B1F3B]">Add product</DialogTitle>
            <DialogDescription>Creates the product in the Yash Trade App. You can add photos right after.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4" noValidate>
            <ProductFields form={createForm} setForm={setCreateForm} cats={cats} />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving} data-testid="admin-product-create-cancel">Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-[#0B1F3B] hover:bg-[#081a31] font-semibold min-w-[120px]" data-testid="admin-product-create-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create product"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
