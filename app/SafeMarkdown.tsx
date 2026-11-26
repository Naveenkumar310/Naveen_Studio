import Markdown, { defaultUrlTransform } from 'react-markdown';

/**
 * Renders Markdown without raw HTML and without loading images, so a document or a copied
 * repo doc cannot make this local app contact other servers. Links open in a new tab.
 */
export default function SafeMarkdown({ children }: { children: string }) {
    return <div className="markdown-body"><Markdown urlTransform={defaultUrlTransform} components={{
        img: ({ src, alt }) => <span className="image-placeholder" title={typeof src === 'string' ? src : ''}>Image: {alt || 'untitled'}</span>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    }}>{children}</Markdown></div>;
}
