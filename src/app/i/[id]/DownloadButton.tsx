"use client";

export function DownloadButton({
  url,
  filename,
  className,
}: {
  url: string;
  filename: string;
  className?: string;
}) {
  const onClick = async () => {
    // The `download` attribute is ignored cross-origin (R2 is a different host),
    // so fetch the bytes and trigger a programmatic download via a blob URL.
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <button type="button" onClick={onClick} className={className}>
      Download
    </button>
  );
}
