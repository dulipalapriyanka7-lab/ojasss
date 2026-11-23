import {prepareVideo,type VideoQuality} from '@/lib/videoOptimization';
import {CITIES} from '@/lib/cities';
import './my-city.css';
import {formatCtaDestination} from '@/lib/ctaDestination';
import {ThumbnailPicker} from '@/components/upload/ThumbnailPicker';
import {UploadCategoryPicker} from '@/components/upload/UploadCategoryPicker';
import { parseHashtags, validHashtags, validSource } from '@/lib/contentMetadata';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Film, Image as ImageIcon, RefreshCw, Scale, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { reference, type Category } from '@/api';
import { ApiError } from '@/api/client';
import { createPost, uploadObject, type CreatePostRequest } from '@/api/upload';
import { Page } from '@/components/layout/AppShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePublicSettings } from '@/hooks/usePostActions';
import { useUploadLocation } from '@/hooks/useUploadLocation';
import { COMPLAINT_SUBCATEGORIES, COUNTRIES, LANGUAGES } from '@/lib/constants';
import { UploadLocationMap } from '@/components/upload/UploadLocationMap';
import { RegionPicker } from '@/components/ui/RegionPicker';
import { duration } from '@/lib/format';
import { compressImage, formatBytes, inspectVideo, sniffFile, type SniffedMime } from '@/lib/media';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { initialVideoEdit, type VideoEdit } from '@/lib/videoEdit';
import { readVideoEditDraft, removeVideoEditDraft, saveVideoEditDraft, type VideoEditDraft } from '@/lib/videoEditDraft';
import './creator-studio.css';

const VideoEditStudio = lazy(() => import('@/components/upload/VideoEditStudio'));

type Stage = 'select' | 'edit' | 'details' | 'optimizing' | 'uploading' | 'processing' | 'done' | 'failed';

interface Media {
  file: File;
  kind: 'video' | 'poster';
  mime: SniffedMime;
  previewUrl: string;
  width: number;
  height: number;
  durationMs: number | null;
  thumbnail: Blob | null;
  defaultThumbnail?: Blob;
  thumbnailMime?: SniffedMime;
  /** Compressed/re-encoded image (posters) — also strips EXIF/GPS. */
  processed: Blob | null;
  editQuality?: VideoQuality;
}

const schema = z.object({
  caption: z.string().trim().max(2200, 'Captions can be at most 2200 characters.'),
  category: z.enum(['technology','education','gaming','lifestyle','one_chance','horror_stories','music_dance','world_education','entertainment', 'business_promotion', 'public_complaint', 'news', 'part_time_jobs','full_time_jobs'], { message: 'Choose a category.' }),
  language: z.string().min(2),
  country: z.string().length(2, 'Choose the country for this post.'),
  hashtags: z.string().max(500),
  visibility: z.enum(['public','followers','private']),
  audioTitle: z.string().max(120),
  sourceUrl: z.string().max(500),
  rightsConfirmed: z.boolean(),
  contentOrigin: z.enum(['', 'copy_paste', 'new_content']),
  location: z.string().trim().max(120, 'Location can be at most 120 characters.'),
  ctaType: z.string(),
  ctaUrl: z.string().trim().max(500),
  ctaLabel: z.string().trim().max(40, 'Button text can be at most 40 characters.'),
  complaint: z.object({
    subcategory: z.string(),
    description: z.string().trim(),
    location: z.string().trim(),
    legalAssistanceRequested: z.boolean(),
    forwardRequested: z.boolean(),
    authorityId: z.string(),
    acceptedDisclaimer: z.boolean(),
  }),
});
type Form = z.infer<typeof schema>;

const initialForm: Form = {
  caption: '', category: 'entertainment', language: 'en', country: '', contentOrigin: '', hashtags:'', visibility:'public', audioTitle:'', sourceUrl:'', rightsConfirmed:false, location: '', ctaType: '', ctaUrl: '', ctaLabel: '',
  complaint: { subcategory: '', description: '', location: '', legalAssistanceRequested: false, forwardRequested: false, authorityId: '', acceptedDisclaimer: false },
};

function validate(f: Form, ctaKind: string | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  const r = schema.safeParse(f);
  if (!r.success) for (const i of r.error.issues) errors[i.path.join('.')] = i.message;
  if(!validHashtags(parseHashtags(f.hashtags)))errors.hashtags='Use up to 20 hashtags, with letters, numbers or underscores.';
  if(f.contentOrigin==='copy_paste'){if(f.sourceUrl.trim()&&!validSource(f.sourceUrl.trim()))errors.sourceUrl='Enter the original HTTPS source link.';if(!f.rightsConfirmed)errors.rightsConfirmed='Confirm you have permission or the appropriate rights to share this content.';}
  if (f.ctaType) {
    const url = f.ctaUrl.trim();
    const ok =
      ctaKind === 'url' ? /^https:\/\/[^\s/$.?#][^\s]*$/i.test(url)
      : ctaKind === 'phone' || ctaKind === 'whatsapp' ? /^\+?[0-9]{8,15}$/.test(url.replace(/\s/g, ''))
      : ctaKind === 'email' ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url) : false;
    if (!ok) {
      errors.ctaUrl = ctaKind === 'url' ? 'Enter a full https:// link.' : ctaKind === 'email' ? 'Enter a valid email address.' : 'Enter a valid phone number with country code, e.g. +919876543210.';
    }
  }
  if (f.category === 'public_complaint') {
    const c = f.complaint;
    if (!c.subcategory) errors['complaint.subcategory'] = 'Choose the type of complaint.';
    if (c.description.trim().length < 20) errors['complaint.description'] = 'Describe the issue in at least 20 characters.';
    if (c.location.trim().length < 3) errors['complaint.location'] = 'Enter where this happened.';
    if (c.forwardRequested && !c.authorityId) errors['complaint.authorityId'] = 'Choose the authority to forward to.';
    if (!c.acceptedDisclaimer) errors['complaint.acceptedDisclaimer'] = 'Please confirm the declaration to continue.';
  }
  return errors;
}

export default function UploadPage() {
  useSeo({ title: 'Upload', noindex: true });
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { data: settings } = usePublicSettings();
  const ctaTypes = useQuery({ queryKey: ['cta-types'], queryFn: reference.ctaTypes, staleTime: 3600_000 });
  const authorities = useQuery({ queryKey: ['authorities'], queryFn: reference.authorities, staleTime: 3600_000 });

  const [videoQuality,setVideoQuality]=useState<VideoQuality>('hd'),[optimizationNote,setOptimizationNote]=useState('');
  const [episodeMode,setEpisodeMode]=useState(search.get('episode')==='1'),[seriesTitle,setSeriesTitle]=useState(search.get('series')??''),[seriesGenre,setSeriesGenre]=useState(search.get('genre')??'Horror'),[episodeTitle,setEpisodeTitle]=useState(''),[episodeNumber,setEpisodeNumber]=useState(Math.max(1,Number(search.get('next'))||1)),[episodeTotal,setEpisodeTotal]=useState<number|''>(''),[episodeAccess,setEpisodeAccess]=useState<'free'|'interest'|'premium'>('free'),[episodeInterestGoal,setEpisodeInterestGoal]=useState(15),[applyEpisodeAccess,setApplyEpisodeAccess]=useState(false),[applyThrough,setApplyThrough]=useState<number|''>('');
  const [thumbnailBusy,setThumbnailBusy]=useState(false);
  const [stage, setStage] = useState<Stage>('select');
  const [detailView,setDetailView]=useState<'selected'|'form'|'review'>('selected');
  const reduceMotion=useReducedMotion();
  const [media, setMedia] = useState<Media | null>(null);
  const [originalVideo, setOriginalVideo] = useState<(Media & { durationMs: number }) | null>(null);
  const [videoEdit, setVideoEdit] = useState<VideoEdit | null>(null);
  const [draft, setDraft] = useState<VideoEditDraft | null>(null);
  const draftUser = me?.id;
  useEffect(() => {
    let active = true;
    setDraft(null);
    if (draftUser) void readVideoEditDraft(draftUser).then(value => {
      if (active) setDraft(value ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, [draftUser]);
  const originalUrl = originalVideo?.previewUrl;
  const outputUrl = media?.previewUrl === originalUrl ? undefined : media?.previewUrl;
  const [previewPoster,setPreviewPoster]=useState('');
  useEffect(()=>{if(!media?.thumbnail){setPreviewPoster('');return;}const url=URL.createObjectURL(media.thumbnail);setPreviewPoster(url);return()=>URL.revokeObjectURL(url);},[media?.thumbnail]);
  const [inspecting, setInspecting] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(()=>({...initialForm,language:me?.preferred_language??'en',country:COUNTRIES.some(c=>c.value===me?.country)?me!.country!:''}));
  const detectedLocation = useCallback((location: string)=>setForm(f=>({...f,location})),[]);
  const autoLocation = useUploadLocation(stage === 'details',detectedLocation);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [postCity,setPostCity]=useState('');
  useEffect(()=>{if(me?.city)setPostCity(c=>c||me.city!);},[me?.city]);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; status: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>()=>abortRef.current?.(),[]);
  useEffect(()=>{document.body.classList.add('creator-studio-open');return()=>document.body.classList.remove('creator-studio-open');},[]);

  const maxVideoMb = settings?.['uploads.max_video_mb'] ?? 100;
  const maxImageMb = settings?.['uploads.max_image_mb'] ?? 10;
  const maxSeconds = settings?.['uploads.max_video_seconds'] ?? 180;
  const episodeLimit = Number(settings?.['episodes.max_per_series'] ?? 0);
  const cta = ctaTypes.data?.find((c) => c.id === form.ctaType);

  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  // Warn before leaving mid-upload.
  useEffect(() => {
    if (stage !== 'uploading' && stage !== 'processing' && stage !== 'optimizing') return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [stage]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setC = <K extends keyof Form['complaint']>(k: K, v: Form['complaint'][K]) =>
    setForm((f) => ({ ...f, complaint: { ...f.complaint, [k]: v } }));

  async function pick(file: File | undefined, restored?: VideoEditDraft) {
    if (!file) return;
    setPickError(null);
    setInspecting(true);
    try {
      const mime = await sniffFile(file);
      if (!mime) throw new Error('Unsupported file. Upload an MP4, MOV or WebM video, or a JPG, PNG or WebP image.');
      if (mime.startsWith('video/')) {
        if (file.size > maxVideoMb * 1024 * 1024) throw new Error(`Videos can be up to ${maxVideoMb} MB. This one is ${formatBytes(file.size)}.`);
        const meta = await inspectVideo(file);
        if (meta.durationMs > maxSeconds * 1000) throw new Error(`Videos can be up to ${maxSeconds} seconds. This one is ${duration(meta.durationMs)}.`);
        setMedia(null);
        setOriginalVideo({ file, kind: 'video', mime, previewUrl: URL.createObjectURL(file), width: meta.width, height: meta.height, durationMs: meta.durationMs, thumbnail: meta.thumbnail, defaultThumbnail: meta.thumbnail, processed: null });
        setVideoEdit(restored?.edit ?? initialVideoEdit(meta.durationMs / 1000));
        if (restored) {
          set('contentOrigin', restored.origin);
          setEpisodeMode(restored.episode);
          setSeriesTitle(restored.seriesTitle);
          setSeriesGenre(restored.seriesGenre);
          setEpisodeNumber(restored.episodeNumber);
        }
        setStage('edit');
        return;
      } else {
        if (file.size > maxImageMb * 1024 * 1024 * 3) throw new Error(`Images can be up to ${maxImageMb} MB.`);
        const img = await compressImage(file);
        if (img.blob.size > maxImageMb * 1024 * 1024) throw new Error(`Images can be up to ${maxImageMb} MB after compression.`);
        setMedia({ file, kind: 'poster', mime: img.mime, previewUrl: URL.createObjectURL(img.blob), width: img.width, height: img.height, durationMs: null, thumbnail: null, processed: img.blob });
      }
      setStage('details');
      setDetailView('selected');
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'This file could not be read.');
    } finally {
      setInspecting(false);
    }
  }

  function reset() {
    abortRef.current?.();
    setMedia(null);setOriginalVideo(null);setVideoEdit(null);setOptimizationNote('');
    setForm(initialForm);
    setErrors({});
    setProgress(0);
    setFailure(null);
    setResult(null);
    setStage('select');
    setDetailView('selected');
  }

  async function publish() {
    if (!media || !me || thumbnailBusy) return;
    const errs = validate(form, cta?.target_kind);
    if (media.kind === 'video' && !form.contentOrigin) errs.contentOrigin = 'Select Copy-Paste Content or New Content before uploading.';
    if (media.kind === 'video' && episodeMode && !seriesTitle.trim()) errs.seriesTitle = 'Enter a short movie title.';
    if (postCity.trim().length < 2) errs.city = 'Choose the city this post belongs to.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fix the highlighted fields.');
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setStage('uploading');
    setFailure(null);
    setProgress(0);
    try {
      let uploadBlob=media.processed??media.file,uploadMime=media.mime,uploadWidth=media.width,uploadHeight=media.height;
      if(media.kind==='video' && media.editQuality !== videoQuality && !(media.editQuality && videoQuality === 'original')){
        setStage('optimizing');setOptimizationNote('');const controller=new AbortController();abortRef.current=()=>controller.abort();
        const prepared=await prepareVideo(media.file,videoQuality,{width:media.width,height:media.height,durationMs:media.durationMs??0,mime:media.mime==='video/quicktime'?'video/quicktime':media.mime==='video/webm'?'video/webm':'video/mp4'},setProgress,controller.signal);
        uploadBlob=prepared.blob;uploadMime=prepared.mime;uploadWidth=prepared.width;uploadHeight=prepared.height;setOptimizationNote(prepared.note);
      }
      setStage('uploading');setProgress(0);
      let thumbPath: string | null = null;
      if (media.thumbnail) {
        const t = uploadObject(media.thumbnail, media.thumbnailMime ?? 'image/jpeg', me.id);
        abortRef.current = t.abort;
        thumbPath = await t.promise;
      }
      const main = uploadObject(uploadBlob, uploadMime, me.id, (p) => setProgress(p));
      abortRef.current = main.abort;
      const mediaPath = await main.promise;

      setStage('processing');
      const req: CreatePostRequest = {
        kind: media.kind,
        hashtags:parseHashtags(form.hashtags), visibility:form.visibility, audioTitle:form.audioTitle.trim()||null,
        repost:media.kind==='video'&&form.contentOrigin==='copy_paste'?{sourceUrl:form.sourceUrl.trim(),rightsConfirmed:form.rightsConfirmed}:null,
        contentOrigin: media.kind === 'video' ? form.contentOrigin as 'copy_paste' | 'new_content' : null,
        mediaPath,
        thumbnailPath: thumbPath,
        width: uploadWidth,
        height: uploadHeight,
        durationMs: media.durationMs,
        caption: form.caption.trim(),
        category: form.category as Category,
        language: form.language,
        country: form.country,
        location: form.location.trim() || null,
        city: postCity.trim(),
        cta: form.ctaType ? { type: form.ctaType, url: formatCtaDestination(cta?.target_kind,form.ctaUrl), label: form.ctaLabel.trim() || null } : null,
        complaint: form.category === 'public_complaint' ? {
          subcategory: form.complaint.subcategory,
          description: form.complaint.description.trim(),
          location: form.complaint.location.trim(),
          legalAssistanceRequested: form.complaint.legalAssistanceRequested,
          forwardRequested: form.complaint.forwardRequested,
          authorityId: form.complaint.forwardRequested ? form.complaint.authorityId || null : null,
          acceptedDisclaimer: form.complaint.acceptedDisclaimer,
        } : null,
        series: media.kind==='video'&&episodeMode ? {title:seriesTitle.trim(),genre:seriesGenre.trim(),episodeTitle:episodeTitle.trim(),episodeNumber,episodeTotal:episodeTotal===''?null:episodeTotal,access:episodeAccess,interestGoal:episodeInterestGoal,applyAccessToExisting:applyEpisodeAccess,applyThrough:applyEpisodeAccess?(applyThrough===''?episodeNumber:applyThrough):null} : null,
      };
      const r = await createPost(req);
      // Show the new post right away rather than after the 30s staleTime.
      for (const key of ['feed', 'profile', 'profile-posts', 'explore']) void qc.invalidateQueries({ queryKey: [key] });
      setResult(r);
      setStage('done');
      if (draftUser && draft && originalVideo?.file === draft.file) {
        void removeVideoEditDraft(draftUser).then(() => setDraft(null)).catch(() => {});
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === 'ABORTED'||(e instanceof DOMException&&e.name==='AbortError')) {
        setStage('details');
        return;
      }
      if (err?.fields) {
        setErrors(err.fields);
        setStage('details');
        setDetailView('form');
        toast.error(err.message);
        return;
      }
      setFailure(err?.message ?? 'The upload failed. Check your connection and try again.');
      setStage('failed');
    }
  }

  const steps = originalVideo ? ['Select', 'Edit', 'Details', 'Publish'] : ['Select', 'Details', 'Publish'];
  const stepIndex = stage === 'select' || (stage === 'details' && detailView === 'selected') ? 0 : steps.indexOf(stage === 'details' && detailView === 'form' ? 'Details' : 'Publish');
  const continueToReview=()=>{
    const errs=validate(form,cta?.target_kind);
    if(media?.kind==='video'&&!form.contentOrigin)errs.contentOrigin='Select Copy-Paste Content or New Content before uploading.';
    if(media?.kind==='video'&&episodeMode&&!seriesTitle.trim())errs.seriesTitle='Enter a short movie title.';
    setErrors(errs);
    if(Object.keys(errs).length){toast.error('Please fix the highlighted fields.');document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
    setDetailView('review');
    window.scrollTo({top:0,behavior:reduceMotion?'instant':'smooth'});
  };
  const editDetails=()=>{setDetailView('form');window.scrollTo({top:0,behavior:reduceMotion?'instant':'smooth'});};


  if (stage === 'edit' && originalVideo && videoEdit) {
    return <Suspense fallback={<Page><p role="status">Opening OJASSS Edit…</p></Page>}>
      <VideoEditStudio source={originalVideo} edit={videoEdit} update={setVideoEdit}
        sourceLabel={episodeMode ? 'Short movie' : form.contentOrigin === 'copy_paste' ? 'Copy-Paste' : form.contentOrigin === 'new_content' ? 'New Content' : 'Video'}
        maxBytes={maxVideoMb * 1024 * 1024}
        onSave={draftUser ? async () => {
          const nextDraft = { file: originalVideo.file, edit: videoEdit, origin: form.contentOrigin, episode: episodeMode, seriesTitle, seriesGenre, episodeNumber };
          await saveVideoEditDraft(draftUser, nextDraft);
          setDraft(nextDraft);
        } : undefined}
        onBack={() => { setMedia(null); setOriginalVideo(null); setVideoEdit(null); setStage('select'); }}
        onNext={async (file, quality) => {
          const meta = quality ? await inspectVideo(file) : originalVideo;
          if (meta.durationMs > maxSeconds * 1000) throw new Error('The edited video exceeds the upload duration limit. Shorten it slightly in Trim and try again.');
          const hasCustomCover = media?.thumbnail && media.thumbnail !== media.defaultThumbnail;
          const edited: Media = quality ? {
            ...originalVideo, ...meta, file, mime: 'video/mp4', previewUrl: URL.createObjectURL(file),
            defaultThumbnail: meta.thumbnail ?? undefined, editQuality: quality,
          } : originalVideo;
          setMedia(hasCustomCover ? { ...edited, thumbnail: media.thumbnail, thumbnailMime: media.thumbnailMime } : edited);
          if (quality) setVideoQuality(quality);
          setStage('details');
          editDetails();
        }} />
    </Suspense>;
  }

  return (
    <Page width="lg" className="upload-page-slim creator-studio" >
      <header className="upload-intro"><div><span className="upload-eyebrow">CREATOR STUDIO</span><h1>{stage==='details'&&detailView==='form'?<>Add details to your <span>video</span></>:stage==='details'&&detailView==='review'?<>Ready to <span>publish?</span></>:<>Create something worth <span>sharing</span></>}</h1><p>{stage==='details'&&detailView==='form'?'Help people discover and love your content.':'Your ideas. Your community. Your next moment.'}</p></div><img src="/brand/creator-clapper.svg" alt="" aria-hidden className="studio-hero-art"/></header>

      <ol className="upload-stepper mb-4 flex items-center gap-2" aria-label="Upload progress">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', i < stepIndex ? 'bg-success text-white' : i === stepIndex ? 'bg-brand text-on-brand' : 'bg-surface-2 text-fg-3')}>
              {i < stepIndex ? <CheckCircle2 aria-hidden size={16} /> : i + 1}
            </span>
            <span className={cn('text-sm font-medium', i === stepIndex ? 'text-fg' : 'text-fg-3')}>{s}</span>
            {i < steps.length - 1 && <span aria-hidden className={cn('h-px flex-1', i < stepIndex ? 'bg-success' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {stage === 'select' && (
          <motion.div key="select" initial={{ opacity: 0, y: reduceMotion?0:8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion?0:-8 }} transition={{duration:reduceMotion?0:.22}}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files[0]); }}
              className={cn('upload-dropzone flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors sm:py-8', dragOver ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface')}
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-float"><UploadCloud aria-hidden size={21} /></div>
              <div>
                <p className="text-sm font-semibold">Choose your format</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-fg-3">MP4, MOV or WebM up to {maxVideoMb} MB and {maxSeconds}s · JPG, PNG or WebP up to {maxImageMb} MB</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
                className="sr-only"
                id="media-input"
                onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
              />
              <div className="upload-format-options">
                {([{origin:'copy_paste',label:'Copy-Paste video',note:'Share a discovery from another platform',series:false},{origin:'new_content',label:'New video',note:'Original moments, created by you',series:false},{origin:'new_content',label:'Short movie · Episodes',note:'NEW · Build your episode series',series:true},{origin:'',label:'Upload poster',note:'Make your story stand out in an image',series:false}] as const).map(option=><Button variant="secondary" className="upload-format-card" key={option.label} onClick={()=>{setEpisodeMode(option.series);set('contentOrigin',option.origin);if(inputRef.current){inputRef.current.accept=option.origin?'video/mp4,video/quicktime,video/webm':'image/jpeg,image/png,image/webp';inputRef.current.click();}}} loading={inspecting} leading={option.origin?<Film aria-hidden size={16}/>:<ImageIcon aria-hidden size={16}/>}><span className="upload-format-copy"><span>{option.label}</span><small>{option.note}</small></span><ArrowRight className="upload-format-arrow" size={15} aria-hidden/></Button>)}
              </div>
              {draft && <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" disabled={inspecting} onClick={() => void pick(draft.file, draft)}>Resume video draft</Button>
                <Button variant="ghost" disabled={inspecting} onClick={() => {
                  if (draftUser) void removeVideoEditDraft(draftUser).then(() => setDraft(null)).catch(() => setPickError('The saved draft could not be removed.'));
                }}>Remove draft</Button>
              </div>}
              {pickError && <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2 text-sm text-danger"><AlertTriangle aria-hidden size={16} />{pickError}</p>}
            </div>
            <div className="upload-tips mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { icon: Film, t: 'Vertical video works best', d: '9:16 at 1080×1920. Other shapes are shown uncropped.' },
                { icon: ImageIcon, t: 'Posters stay sharp', d: 'Large images are optimised and location data is removed.' },
                { icon: ShieldCheck, t: 'Follow the guidelines', d: 'Posts are checked against our community guidelines.' },
              ].map((x) => (
                <Card key={x.t} className="p-3">
                  <x.icon aria-hidden size={16} className="text-brand" />
                  <p className="mt-2 text-sm font-semibold">{x.t}</p>
                  <p className="mt-1 text-xs text-fg-3">{x.d}</p>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {(stage === 'details' || stage === 'optimizing' || stage === 'uploading' || stage === 'processing' || stage === 'failed') && media && (
          <motion.div key="details" initial={{ opacity: 0, y: reduceMotion?0:8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{duration:reduceMotion?0:.22}} className={cn('studio-workspace grid gap-4',detailView==='form'&&'lg:grid-cols-[260px_minmax(0,1fr)]')}>
            <div className={cn('studio-preview-column',detailView==='form'&&'lg:sticky lg:top-6 lg:self-start')}>
              <div className="upload-preview-frame relative overflow-hidden bg-black">
                {media.kind === 'video'
                  ? <video src={media.previewUrl} poster={previewPoster||undefined} preload="metadata" className="size-full object-contain" controls playsInline muted aria-label="Preview of your video" />
                  : <img src={media.previewUrl} alt="Preview of your poster" className="size-full object-contain" />}
              </div>
              <p className="mt-3 text-center text-xs text-fg-3">
                {media.kind === 'video' ? `${media.width}×${media.height} · ${duration(media.durationMs)} · ` : `${media.width}×${media.height} · `}
                {formatBytes((media.processed ?? media.file).size)}
              </p>
              {stage === 'details' && <Button variant="ghost" size="sm" className="studio-replace mx-auto mt-2 flex" onClick={reset} leading={<RefreshCw aria-hidden size={14} />}>Choose a different file <ArrowRight size={13}/></Button>}
              {stage==='details'&&detailView==='selected'&&<div className="studio-selected"><span className="studio-selected-icon"><UploadCloud size={23}/><CheckCircle2 size={13}/></span><div><h2>{media.kind==='video'?'Video':'Poster'} selected successfully!</h2><p>Now add details and publish your content.</p></div><Button className="studio-main-cta" block onClick={editDetails} trailing={<ArrowRight size={16}/>}>Continue to Details</Button></div>}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if(stage==='details'&&detailView==='form')continueToReview();else if(stage==='details'&&detailView==='review')void publish(); }} className={cn('studio-details-form space-y-4',stage==='details'&&detailView==='selected'&&'hidden')} noValidate>
              {stage==='details'&&detailView==='review'&&<section className="studio-review" aria-label="Publication summary"><h2>Your post at a glance</h2><p className="studio-review-caption">{form.caption||'No caption added'}</p><dl><div><dt>Category</dt><dd>{form.category.replaceAll('_',' ')}</dd></div><div><dt>Visibility</dt><dd>{form.visibility==='public'?'Everyone':form.visibility==='followers'?'People who respect you':'Only me'}</dd></div><div><dt>Language</dt><dd>{LANGUAGES.find(l=>l.value===form.language)?.label??form.language}</dd></div><div><dt>Country</dt><dd>{COUNTRIES.find(c=>c.value===form.country)?.label??form.country}</dd></div>{media.kind==='video'&&<><div><dt>Content source</dt><dd>{form.contentOrigin==='new_content'?'New Content':'Copy-Paste'}</dd></div><div><dt>Quality</dt><dd>{videoQuality==='hd'?'HD 1080p':videoQuality==='fast'?'Fast 720p':'Original'}</dd></div></>}{episodeMode&&<div><dt>Episode</dt><dd>{seriesTitle} · {episodeNumber}</dd></div>}</dl><p className="text-xs text-fg-3">Your existing audience, category and review rules apply.</p></section>}
              <fieldset disabled={stage !== 'details'} className={cn('space-y-5',detailView!=='form'&&'hidden')}>
                {errors.seriesTitle&&<p role="alert" className="text-xs text-danger">{errors.seriesTitle}</p>}
                {media.kind === 'video' && <fieldset className="space-y-2"><legend className="text-sm font-semibold">Content source <span className="text-danger">*</span></legend><p className="text-xs text-fg-3">Choose one before uploading this video or reel.</p><div className="upload-source-options grid gap-3 sm:grid-cols-2">{([{value:'copy_paste',label:'Copy-Paste Content',description:'Copy-paste content from another platform.'},{value:'new_content',label:'New Content',description:'New content originally created by you.'}] as const).map(option=><label key={option.value} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',form.contentOrigin===option.value?'border-brand bg-brand-soft':'border-line bg-surface')}><input type="radio" name="contentOrigin" value={option.value} checked={form.contentOrigin===option.value} onChange={()=>set('contentOrigin',option.value)} required aria-invalid={!!errors.contentOrigin} aria-describedby={errors.contentOrigin?'content-origin-error':undefined} className="mt-1 accent-orange-500"/><span><span className="block text-sm font-semibold">{option.label}</span><span className="text-xs text-fg-3">{option.description}</span></span></label>)}</div>{errors.contentOrigin&&<p id="content-origin-error" role="alert" className="text-xs text-danger">{errors.contentOrigin}</p>}</fieldset>}
                {media.kind==='video'&&form.contentOrigin==='copy_paste'&&<Card className="space-y-4 border-brand/25 bg-brand-soft/30 p-4"><Field label="Original source (optional)" error={errors.sourceUrl} hint="Add a link to the original post or creator if available.">{p=><Input {...p} type="url" value={form.sourceUrl} onChange={e=>set('sourceUrl',e.target.value)} placeholder="https://"/>}</Field><Checkbox checked={form.rightsConfirmed} onChange={v=>set('rightsConfirmed',v)}>I have permission or the appropriate rights to share this content.</Checkbox>{errors.rightsConfirmed&&<p role="alert" className="text-xs text-danger">{errors.rightsConfirmed}</p>}</Card>}
                {media.kind==='video'&&episodeMode&&<Card className="space-y-4 border-violet-400/30 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-transparent p-4"><div><p className="text-sm font-bold">Episode series <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] text-white">NEW</span></p><p className="mt-1 text-xs text-fg-3">{episodeLimit>0?`Administrator limit: ${episodeLimit} episodes per series.`:'Publish any episode number. Leave the total blank for an unlimited, open-ended series.'}</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Series title" required>{p=><Input {...p} required maxLength={80} value={seriesTitle} onChange={e=>setSeriesTitle(e.target.value)} placeholder="The Midnight House"/>}</Field><Field label="Episode title (optional)">{p=><Input {...p} maxLength={100} value={episodeTitle} onChange={e=>setEpisodeTitle(e.target.value)} placeholder="The door opens"/>}</Field><Field label="Story category">{p=><Select {...p} value={seriesGenre} onChange={e=>setSeriesGenre(e.target.value)}><option>Horror</option><option>Love</option><option>Thriller</option><option>Comedy</option><option>Drama</option><option>Action</option></Select>}</Field><Field label="Episode number">{p=><Input {...p} type="number" min={1} max={episodeLimit>0?episodeLimit:1000000} value={episodeNumber} onChange={e=>setEpisodeNumber(Math.min(episodeLimit>0?episodeLimit:1000000,Math.max(1,Number(e.target.value))))} />}</Field><Field label="Total episodes (optional)" hint={episodeLimit>0?`Maximum ${episodeLimit} episodes.`:'No limit when left blank.'}>{p=><Input {...p} type="number" min={episodeNumber} max={episodeLimit>0?episodeLimit:1000000} value={episodeTotal} onChange={e=>setEpisodeTotal(e.target.value===''?'':Math.max(episodeNumber,Math.min(episodeLimit>0?episodeLimit:1000000,Number(e.target.value))))} placeholder={episodeLimit>0?String(episodeLimit):'Unlimited'}/>}</Field></div><fieldset className="space-y-2"><legend className="text-sm font-semibold">Access for this episode</legend><div className="grid gap-2 sm:grid-cols-3">{([{value:'free',label:'Free',note:'Everyone can watch'},{value:'interest',label:'Interest unlock',note:'Matching interests + activity'},{value:'premium',label:'Premium locked',note:'Paid access required'}] as const).map(option=><label key={option.value} className={cn('cursor-pointer rounded-xl border p-3 transition-colors',episodeAccess===option.value?'border-fuchsia-400/70 bg-fuchsia-500/10':'border-line bg-surface/60')}><input className="sr-only" type="radio" name="episode-access" checked={episodeAccess===option.value} onChange={()=>setEpisodeAccess(option.value)}/><span className="block text-xs font-bold">{option.label}</span><span className="mt-1 block text-[11px] text-fg-3">{option.note}</span></label>)}</div></fieldset>{episodeAccess==='interest'&&<Field label="Interest goal" hint="Show the creator how many viewers want this locked episode.">{p=><Input {...p} type="number" min={1} max={100000} value={episodeInterestGoal} onChange={e=>setEpisodeInterestGoal(Math.max(1,Number(e.target.value)||1))}/>}</Field>}<div className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-surface/45 p-3"><Checkbox checked={applyEpisodeAccess} onChange={setApplyEpisodeAccess}>Apply this access rule to earlier episodes</Checkbox>{applyEpisodeAccess&&<Field label="Through episode" className="min-w-[130px]">{p=><Input {...p} type="number" min={1} max={episodeNumber} value={applyThrough} onChange={e=>setApplyThrough(e.target.value===''?'':Math.min(episodeNumber,Math.max(1,Number(e.target.value))))} placeholder={String(episodeNumber)}/>}</Field>}</div></Card>}
                <Field label={media.kind==='video'?'Caption (optional)':'Caption'} error={errors.caption} hint={`${form.caption.length}/2200 · Add context, hashtags and mentions.`}>
                  {(p) => <Textarea {...p} value={form.caption} onChange={(e) => set('caption', e.target.value)} maxLength={2200} placeholder="What's this about?" />}
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Hashtags" error={errors.hashtags} hint={`${parseHashtags(form.hashtags).length}/20 · Up to 20 tags, separated by spaces.`}>{p=><><Input {...p} value={form.hashtags} onChange={e=>set('hashtags',e.target.value)} placeholder="Add a hashtag…"/><div className="studio-hashtags">{parseHashtags(form.hashtags).map(tag=><button type="button" key={tag} aria-label={`Remove hashtag ${tag}`} onClick={()=>set('hashtags',parseHashtags(form.hashtags).filter(t=>t!==tag).map(t=>'#'+t).join(' '))}>#{tag}<X size={11} aria-hidden/></button>)}</div></>}</Field>
                  <Field label="Visibility">{p=><Select {...p} value={form.visibility} onChange={e=>set('visibility',e.target.value as Form['visibility'])}><option value="public">Everyone</option><option value="followers">People who respect you</option><option value="private">Only me</option></Select>}</Field>
                  {media.kind==='video'&&<><Field label="Audio credit" hint="Optional title or creator credit.">{p=><Input {...p} maxLength={120} value={form.audioTitle} placeholder="Optional title or creator credit." onChange={e=>set('audioTitle',e.target.value)}/>}</Field><div className="sm:col-span-2"><ThumbnailPicker onBusyChange={setThumbnailBusy} value={media.thumbnail} original={media.defaultThumbnail??null} onChange={(blob,mime)=>setMedia(current=>current?{...current,thumbnail:blob,thumbnailMime:mime}:current)}/></div></>}
                </div>
                {media.kind==='video'&&<fieldset className="space-y-2 rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-500/10 to-transparent p-3"><legend className="px-1 text-xs font-semibold">Video quality</legend><div className="grid grid-cols-3 gap-2">{([{value:'hd',label:'HD 1080p',hint:'Recommended'},{value:'fast',label:'Fast 720p',hint:'Smaller upload'},{value:'original',label:'Original',hint:'Keep every detail'}] as const).map(option=><label key={option.value} className={cn('flex cursor-pointer flex-col gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors',videoQuality===option.value?'border-purple-400/60 bg-brand-gradient text-white':'border-line bg-surface text-fg-2')}><input className="sr-only" type="radio" name="video-quality" value={option.value} checked={videoQuality===option.value} onChange={()=>setVideoQuality(option.value)}/><span className="text-xs font-semibold">{option.label}</span><span className="text-[10px] opacity-80">{option.hint}</span></label>)}</div><p className="text-[11px] leading-5 text-fg-3">HD keeps up to 1080p with a smaller file where possible. Low-resolution videos are never enlarged. Original quality is kept if this device cannot optimize the video.</p></fieldset>}
                  <UploadCategoryPicker value={form.category} onChange={value=>set('category',value)}/>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Language" required error={errors.language}>
                    {(p) => <RegionPicker {...p} label="Language" value={form.language} onChange={v=>set('language',v)} options={LANGUAGES} required/>}
                  </Field>
                  <Field label="Country" required error={errors.country} hint="Choose where this post belongs so people can find it by country.">{p=><RegionPicker {...p} label="Country" value={form.country} onChange={v=>set('country',v)} options={COUNTRIES} required/>}</Field>
                  <div className="space-y-2 sm:col-span-2">
                    <Field label="City" required error={errors.city} hint="Your post shows in this city's local feed.">
                      {(p) => <><Input {...p} value={postCity} onChange={e=>setPostCity(e.target.value)} maxLength={60} list="ojasss-cities" placeholder="Search your city…" autoComplete="address-level2"/><datalist id="ojasss-cities">{CITIES.map(c=><option key={c.name} value={c.name}/>)}</datalist></>}
                    </Field>
                    <div className="up-cities">{CITIES.filter(c=>c.popular).map(c=><button type="button" key={c.name} aria-pressed={postCity===c.name} onClick={()=>setPostCity(c.name)}><span aria-hidden="true">{c.icon}</span>{c.name}</button>)}</div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Field label="Location" error={errors.location} hint="Optional. Edit the detected location or remove it before publishing.">
                      {(p) => <Input {...p} value={form.location} onChange={(e) => {autoLocation.markEdited();set('location', e.target.value);}} maxLength={120} autoComplete="address-level2" placeholder="City, area or approximate location" />}
                    </Field>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" loading={autoLocation.busy} onClick={autoLocation.detect}>Use my location</Button>
                      {(form.location || autoLocation.busy) && <Button size="sm" variant="ghost" onClick={()=>{autoLocation.markEdited();set('location','');}}>Remove location</Button>}
                    </div>
                    <div className="studio-location-map"><UploadLocationMap location={form.location}/></div>
                    {autoLocation.message && <p role="status" className="text-xs text-fg-3">{autoLocation.message}</p>}
                  </div>
                </div>

                {form.category === 'public_complaint' && (
                  <Card as="section" className="space-y-4 border-warning/40 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Scale aria-hidden size={22} className="mt-0.5 shrink-0 text-warning" />
                      <div>
                        <h2 className="font-semibold">Complaint details</h2>
                        <p className="mt-1 text-sm text-fg-3">
                          Your complaint is published as <strong>your own allegation</strong>. OJASSS reviews complaints before they go live and does not verify
                          the claims. If you ask us to forward it, we send it to the authority you choose and show the forwarding status on your post.
                        </p>
                      </div>
                    </div>
                    <Field label="Type of complaint" required error={errors['complaint.subcategory']}>
                      {(p) => (
                        <Select {...p} value={form.complaint.subcategory} onChange={(e) => setC('subcategory', e.target.value)}>
                          <option value="">Choose…</option>
                          {COMPLAINT_SUBCATEGORIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </Select>
                      )}
                    </Field>
                    <Field label="Describe the issue" required error={errors['complaint.description']} hint="Stick to facts: what happened, when, and who is affected. Do not share others' private information.">
                      {(p) => <Textarea {...p} value={form.complaint.description} onChange={(e) => setC('description', e.target.value)} maxLength={5000} />}
                    </Field>
                    <Field label="Where did this happen?" required error={errors['complaint.location']}>
                      {(p) => <Input {...p} value={form.complaint.location} onChange={(e) => setC('location', e.target.value)} maxLength={200} placeholder="Street, area, city" />}
                    </Field>
                    <Checkbox checked={form.complaint.legalAssistanceRequested} onChange={(v) => setC('legalAssistanceRequested', v)}>
                      I would like to be contacted about legal assistance options.
                    </Checkbox>
                    <Checkbox checked={form.complaint.forwardRequested} onChange={(v) => setC('forwardRequested', v)}>
                      Forward my complaint to the relevant authority by email.
                    </Checkbox>
                    {form.complaint.forwardRequested && (
                      <Field label="Authority" required error={errors['complaint.authorityId']} hint="Only verified official addresses are used. You cannot enter a custom email.">
                        {(p) => (
                          <Select {...p} value={form.complaint.authorityId} onChange={(e) => setC('authorityId', e.target.value)}>
                            <option value="">{authorities.isPending ? 'Loading…' : (authorities.data?.length ?? 0) === 0 ? 'No authorities available yet' : 'Choose an authority…'}</option>
                            {authorities.data?.map((a) => <option key={a.id} value={a.id}>{a.name}{a.department ? ` — ${a.department}` : ''}{a.jurisdiction ? ` (${a.jurisdiction})` : ''}</option>)}
                          </Select>
                        )}
                      </Field>
                    )}
                    <div className={cn('rounded-xl border p-3', errors['complaint.acceptedDisclaimer'] ? 'border-danger bg-danger-soft' : 'border-line bg-surface-2')}>
                      <Checkbox checked={form.complaint.acceptedDisclaimer} onChange={(v) => setC('acceptedDisclaimer', v)}>
                        I confirm this complaint is true to the best of my knowledge, is my own, and I understand I am responsible for it. I have read the{' '}
                        <Link to="/complaints-disclaimer" target="_blank" className="font-semibold underline">complaints disclaimer</Link>.
                      </Checkbox>
                      {errors['complaint.acceptedDisclaimer'] && <p role="alert" className="mt-2 text-xs font-medium text-danger">{errors['complaint.acceptedDisclaimer']}</p>}
                    </div>
                  </Card>
                )}

                <Card as="section" className="space-y-4 p-4 sm:p-5">
                  <div>
                    <h2 className="font-semibold">Call to action <span className="font-normal text-fg-3">(optional)</span></h2>
                    <p className="mt-1 text-sm text-fg-3">Add a button such as Buy Now or WhatsApp. Unique clicks from other members can earn you rewards after review.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Button type">
                      {(p) => (
                        <Select {...p} value={form.ctaType} onChange={(e) => set('ctaType', e.target.value)}>
                          <option value="">No button</option>
                          {ctaTypes.data?.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </Select>
                      )}
                    </Field>
                    {form.ctaType && (
                      <Field label="Button text" error={errors.ctaLabel} hint={`Default: ${cta?.label ?? ''}`}>
                        {(p) => <Input {...p} value={form.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} maxLength={40} placeholder={cta?.label} />}
                      </Field>
                    )}
                  </div>
                  {form.ctaType && (
                    <Field
                      label={cta?.target_kind === 'url' ? 'Link' : cta?.target_kind === 'email' ? 'Email address' : 'Phone number'}
                      required
                      error={errors.ctaUrl}
                      hint={cta?.target_kind === 'url' ? 'Must start with https://' : cta?.target_kind === 'email' ? undefined : 'Include the country code, e.g. +91…'}
                    >
                      {(p) => (
                        <Input
                          {...p}
                          value={form.ctaUrl}
                          onChange={(e) => set('ctaUrl', e.target.value)}
                          inputMode={cta?.target_kind === 'url' ? 'url' : cta?.target_kind === 'email' ? 'email' : 'tel'}
                          placeholder={cta?.target_kind === 'url' ? 'https://' : cta?.target_kind === 'email' ? 'you@business.com' : '+91'}
                        />
                      )}
                    </Field>
                  )}
                </Card>
              </fieldset>

              {stage === 'details' && (
                <div className="studio-actions flex gap-2">
                  <Button variant="ghost" onClick={()=>detailView==='review'?editDetails():originalVideo?setStage('edit'):setDetailView('selected')} leading={<ArrowLeft size={15}/>}>Back</Button>
                  <Button type="submit" size="lg" disabled={thumbnailBusy} className="studio-main-cta min-w-0 flex-1" trailing={<ArrowRight size={15}/>}>{detailView==='form'?'Continue to Publish':form.category === 'public_complaint' ? 'Submit for review' : 'Publish'}</Button>
                </div>
              )}

              {(stage === 'optimizing' || stage === 'uploading' || stage === 'processing') && (
                <Card className="p-5" as="section">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{stage==='optimizing'?'Optimizing your video…':stage === 'uploading' ? 'Uploading…' : 'Checking your media…'}</span>
                    <span className="tabular text-fg-3">{stage !== 'processing' ? `${Math.round(progress * 100)}%` : ''}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Upload progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn('h-full rounded-full bg-brand-gradient transition-[width] duration-200', stage === 'processing' && 'animate-pulse')} style={{ width: `${stage === 'processing' ? 100 : Math.max(3, progress * 100)}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-fg-3">Keep this page open until publishing finishes.</p>
                  {optimizationNote&&<p className="mt-2 text-xs text-fg-3">{optimizationNote}</p>}
                  {(stage === 'uploading'||stage==='optimizing') && <Button variant="ghost" size="sm" className="mt-2" onClick={() => abortRef.current?.()}>{stage==='optimizing'?'Cancel optimization':'Cancel upload'}</Button>}
                </Card>
              )}

              {stage === 'failed' && (
                <Card className="border-danger/40 p-5" as="section">
                  <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-danger"><AlertTriangle aria-hidden size={18} className="shrink-0" />{failure}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void publish()} leading={<RefreshCw aria-hidden size={16} />}>Try again</Button>
                    <Button variant="secondary" onClick={() => {setStage('details');setDetailView('form');}}>Edit details</Button>
                  </div>
                </Card>
              )}
            </form>
          </motion.div>
        )}

        {stage === 'done' && result && (
          <motion.div key="done" initial={reduceMotion?false:{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{duration:reduceMotion?0:.22}} className="flex flex-col items-center gap-4 py-12 text-center">
            <div className={cn('flex size-18 items-center justify-center rounded-3xl text-white shadow-float', result.status === 'published' ? 'bg-success' : 'bg-warning')}>
              {result.status === 'published' ? <CheckCircle2 aria-hidden size={36} /> : <Clock aria-hidden size={36} />}
            </div>
            <h2 className="text-2xl font-bold">{result.status === 'published' ? 'Your post is live!' : 'Submitted for review'}</h2>
            <p className="max-w-md text-fg-3">
              {result.status === 'published'
                ? 'It is now visible on web and in the OJASSS app. Share it to get your first HOT reactions.'
                : 'Our team reviews posts like this before they go public. We will notify you as soon as it is approved.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to={`/post/${result.id}`}>View post</ButtonLink>
              <Button variant="secondary" onClick={reset}>Create another</Button>
              <Button variant="ghost" onClick={() => navigate(`/profile/${me?.username}`)}>Go to profile</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}

