import { type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { docPath } from "./paths";
import { parseDocHref, slugify } from "./pages";
import { resolveDocAssetSrc } from "./resolveDocAssetSrc";

interface MarkdownDocProps {
  source: string;
  onNavigate: (pageId: string, headingId: string | null) => void;
}

const ABBR_HREF_PREFIX = "abbr:";

/** Turn HTML abbr tags into markdown links the renderer maps back to abbr. */
function encodeAbbrTags(source: string): string {
  return source.replace(
    /<abbr\s+title="([^"]*)">([^<]*)<\/abbr>/gi,
    (_match, title: string, text: string) =>
      `[${text}](${ABBR_HREF_PREFIX}${encodeURIComponent(title)})`,
  );
}

function textFromChildren(children: ReactNode): string {
  return (Array.isArray(children) ? children : [children])
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (child && typeof child === "object" && "props" in child) {
        return textFromChildren(
          (child as { props: { children?: ReactNode } }).props.children,
        );
      }
      return "";
    })
    .join("");
}

function Heading({
  level,
  children,
}: {
  level: 2 | 3;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag id={slugify(textFromChildren(children))}>{children}</Tag>;
}

export function MarkdownDoc({ source, onNavigate }: MarkdownDocProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        url.startsWith(ABBR_HREF_PREFIX) ? url : defaultUrlTransform(url)
      }
      components={{
        h1: ({ children }) => <h1>{children}</h1>,
        h2: ({ children }) => <Heading level={2}>{children}</Heading>,
        h3: ({ children }) => <Heading level={3}>{children}</Heading>,
        a: ({ href, children }) => {
          if (href?.startsWith(ABBR_HREF_PREFIX)) {
            return (
              <abbr title={decodeURIComponent(href.slice(ABBR_HREF_PREFIX.length))}>
                {children}
              </abbr>
            );
          }

          const internal = parseDocHref(href);
          if (internal) {
            return (
              <a
                href={docPath(internal.pageId, internal.headingId)}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(internal.pageId, internal.headingId);
                }}
              >
                {children}
              </a>
            );
          }

          return (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          );
        },
        img: ({ src, alt }) => (
          <img alt={alt ?? ""} src={resolveDocAssetSrc(src)} />
        ),
      }}
    >
      {encodeAbbrTags(source)}
    </ReactMarkdown>
  );
}
