import React, { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { uploadApi } from '../../lib/api';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  type?: 'cover' | 'inline';
  aspectClass?: string;
  placeholder?: string;
}

export const ImageUpload = ({
  value,
  onChange,
  type = 'inline',
  aspectClass = 'aspect-video',
  placeholder = 'Click or drag to upload image',
}: ImageUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const result = type === 'cover'
        ? await uploadApi.cover(file)
        : await uploadApi.inline(file);
      onChange(result.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="w-full">
      {value ? (
        <div className={`relative w-full overflow-hidden rounded-xl border ${aspectClass}`}>
          <img src={value} alt="Uploaded" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80"
            aria-label="Remove image"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 ${aspectClass}`}
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <>
              <Upload size={24} />
              <span className="text-sm">{placeholder}</span>
              <span className="text-xs">JPG, PNG, WebP — max 5MB</span>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
};
