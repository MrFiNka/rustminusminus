import { useEffect } from "react";

export const Lightbox = ({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
            <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full cursor-default rounded-md border border-border object-contain"
            />
        </div>
    );
};
