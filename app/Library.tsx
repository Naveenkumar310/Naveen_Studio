import { useState, useEffect } from 'react';
import { FileText, Star, Clock, Plus, Search, ArrowLeft, X, AlertTriangle } from 'lucide-react';
import SafeMarkdown from './SafeMarkdown';
import { api, ApiError, message, ago, categories, type Doc } from './model';

type Props = {
    workspace: string; documents: Doc[]; selected: Doc | null; onSelect: (d: Doc | null) => void;
    refresh: () => Promise<void>; notify: (s: string) => void; onDirtyChange: (dirty: boolean) => void;
};
export default function Library({ workspace, documents, selected, onSelect, refresh, notify, onDirtyChange }: Props) {
    const [category, setCategory] = useState('All');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState('');
    const [tags, setTags] = useState('');
    const [title, setTitle] = useState('');
    const [tabs, setTabs] = useState<string[]>([]);
    const [history, setHistory] = useState<any[] | null>(null);
    const [create, setCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [creatingCategory, setCreatingCategory] = useState('Documents');
    const [busy, setBusy] = useState(false);
    const load = (d: Doc) => { setDraft(d.content); setTags(d.tags); setTitle(d.title); };
    const dirty = !!selected && (draft !== selected.content || tags !== selected.tags || title !== selected.title);
    // The newest copy of the open document, from the 10-second refresh. A higher version means it changed outside the editor.
    const latest = selected ? documents.find(d => d.id === selected.id) : undefined;
    const changedOutside = !!(selected && latest && latest.version > selected.version);

    useEffect(() => {
        if (selected) { load(selected); setHistory(null); setTabs(t => t.includes(selected.id) ? t : [...t, selected.id]); }
    }, [selected?.id]);
    useEffect(() => { onDirtyChange(dirty); }, [dirty]);
    useEffect(() => () => onDirtyChange(false), []);
    useEffect(() => {
        // Nothing to lose: follow the outside change silently.
        if (changedOutside && latest && !dirty) { onSelect(latest); load(latest); }
    }, [latest?.version]);

    const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { notify(message(e)); } finally { setBusy(false); } };
    const open = (d: Doc | null) => {
        if (dirty && !window.confirm('Discard unsaved document changes?')) return;
        onSelect(d);
    };
    const save = () => {
        if (!selected || !window.confirm(`Approve saving changes to “${selected.title}”? The previous version will be kept in History.`)) return;
        run(async () => {
            try {
                const d = await api(`/w/${workspace}/documents`, { ...selected, title, tags, content: draft, approved: true });
                onSelect(d); await refresh(); notify('Document saved. The previous version is in History.');
            } catch (e) {
                if (e instanceof ApiError && e.status === 409) { await refresh(); notify('This document changed outside the editor. Choose which version to keep, then save again.'); }
                else throw e;
            }
        });
    };
    const filtered = documents.filter(d => (category === 'All' || (category === 'Favorites' ? !!d.favorite : d.category === category)) && `${d.title} ${d.tags} ${d.content.slice(0, 2000)}`.toLowerCase().includes(query.toLowerCase()));
    const titleOf = (id: string) => documents.find(d => d.id === id)?.title || 'Untitled';

    return <div className="library-page">
        {selected ? <>
            <div className="document-tabs"><button onClick={() => open(null)}><ArrowLeft size={15} /> Library</button>{tabs.filter(id => documents.some(d => d.id === id)).map(id => <button key={id} className={selected.id === id ? 'active' : ''} onClick={() => id !== selected.id && open(documents.find(x => x.id === id) || null)}><FileText size={14} />{titleOf(id)}</button>)}</div>
            {changedOutside && dirty && latest && <div className="conflict-banner" role="alert">
                <AlertTriangle size={17} />
                <span><b>This document changed outside the editor</b> ({ago(latest.updated)}). Keep your edits and the outside version goes to History when you save, or load the new version and lose your edits.</span>
                <button className="button" onClick={() => { if (window.confirm('Discard your unsaved edits and load the new version?')) { onSelect(latest); load(latest); } }}>Load new version</button>
                <button className="button dark" onClick={() => onSelect(latest)}>Keep my edits</button>
            </div>}
            <div className="document-heading">
                <div><small>{selected.category} · v{selected.version}{dirty ? ' · unsaved changes' : ''}</small><input aria-label="Document title" value={title} onChange={e => setTitle(e.target.value)} /></div>
                <button className="button" onClick={() => run(async () => setHistory(await api(`/w/${workspace}/documents/${selected.id}/versions`)))}><Clock size={15} /> History</button>
                <button className="button dark" disabled={busy || changedOutside} title={changedOutside ? 'Choose which version to keep first' : undefined} onClick={save}>Save changes</button>
            </div>
            <label className="tags-field">Tags<input value={tags} onChange={e => setTags(e.target.value)} placeholder="design, research, ideas" /></label>
            <div className="markdown-editor"><label>Markdown<textarea aria-label="Markdown editor" value={draft} onChange={e => setDraft(e.target.value)} /></label><div className="markdown-preview"><small>Preview</small><SafeMarkdown>{draft}</SafeMarkdown></div></div>
            {history && <section className="history-panel"><h3>Version history</h3>{!history.length && <p>No previous versions yet.</p>}{history.map(v => <details key={v.version}><summary>Version {v.version} · {new Date(v.created).toLocaleString()}</summary><pre>{v.content}</pre></details>)}</section>}
            <section className="related"><h3>Related documents</h3>{documents.filter(d => d.id !== selected.id && (d.content.includes(selected.title) || d.tags.split(',').some(t => t.trim() && selected.tags.split(',').map(x => x.trim()).includes(t.trim())))).map(d => <button key={d.id} onClick={() => open(d)}><FileText size={16} />{d.title}</button>)}</section>
        </> : <>
            <section className="hero compact"><h1>Library</h1><p>Documents, research and reusable thinking.</p><button className="button dark" onClick={() => { setCreate(true); setNewTitle(''); }}><Plus size={16} /> New document</button></section>
            <div className="toolbar">
                <nav className="text-tabs" aria-label="Collections">{['All', 'Favorites', ...categories].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</nav>
                <div className="toolbar-end"><label className="search-field"><Search size={15} /><input aria-label="Filter documents" placeholder="Find a document" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
            </div>
            <div className="note-grid">{filtered.map(d => <article className="note-card document-card" key={d.id}>
                <div className="note-card-top"><span className="chip">{d.category}</span><button className="icon" aria-label={`Favorite ${d.title}`} onClick={() => run(async () => { await api(`/w/${workspace}/documents/${d.id}/favorite`, {}); await refresh(); })}><Star size={16} fill={d.favorite ? 'currentColor' : 'none'} /></button></div>
                <button className="document-open" onClick={() => open(d)}><h3>{d.title}</h3><p>{d.content.replace(/[#*`>]/g, '').slice(0, 160) || 'Empty document'}</p></button>
                <small>{d.tags ? d.tags + ' · ' : ''}v{d.version} · {ago(d.updated)}</small>
            </article>)}</div>
            {!filtered.length && <div className="empty-state"><h2>{query ? 'No matching documents' : 'Nothing here yet'}</h2><p>Create a document to start your library.</p><button className="button" onClick={() => setCreate(true)}><Plus size={15} /> Create document</button></div>}
        </>}
        {create && <div className="overlay" onClick={() => setCreate(false)}><form className="dialog" role="dialog" aria-modal="true" aria-label="New document" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setCreate(false); }} onSubmit={e => { e.preventDefault(); run(async () => { const d = await api(`/w/${workspace}/documents`, { title: newTitle, category: creatingCategory, content: '# ' + newTitle + '\n\n', tags: '' }); setCreate(false); onSelect(d); await refresh(); }); }}>
            <div className="dialog-heading"><h2>New document</h2><button type="button" className="icon" onClick={() => setCreate(false)} aria-label="Close"><X size={18} /></button></div>
            <label>Title<input autoFocus required maxLength={160} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What’s on your mind?" /></label>
            <label>Collection<select value={creatingCategory} onChange={e => setCreatingCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
            <button className="button dark" disabled={busy}>Create document</button>
        </form></div>}
    </div>;
}
