import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, buildFileUrl } from '../services/api';
import type { Generation, ModelInfo } from '../types';
import { Spinner } from '../components/Spinner';
import { Modal } from '../components/Modal';
import { ImagePreviewModal } from '../components/ImagePreviewModal';

// 切割模式配置
const SLICE_MODES = [
  { id: '3x3', label: '3×3', rows: 3, cols: 3 },
  { id: '2x2', label: '2×2', rows: 2, cols: 2 },
  { id: '4x4', label: '4×4', rows: 4, cols: 4 },
  { id: '2x3', label: '2×3', rows: 2, cols: 3 },
  { id: '3x2', label: '3×2', rows: 3, cols: 2 },
  { id: 'custom', label: '自定义', rows: 3, cols: 3 },
];

const ENHANCE_DEFAULT_MODEL = 'nano-banana';
const ENHANCE_PRESET_PROMPT =
  '保持原图构图与主体不变，仅提升清晰度与细节，去噪，增强纹理与锐度，不新增元素，不改变风格。';
const ENHANCE_IMAGE_SIZE = '1K';
const ENHANCE_ASPECT_RATIO = 'auto';
const ENHANCE_ASPECT_OPTIONS = ['auto', '1:1', '3:4', '4:3', '9:16', '16:9'];
const ENHANCE_SIZE_OPTIONS = ['1K', '2K', '4K'];
const ENHANCE_POLL_INTERVAL = 2000;
const ENHANCE_POLL_MAX_ATTEMPTS = 90;

const CUSTOM_MODE_ID = 'custom';
const MAX_CUSTOM_GRID = 8;

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildEvenSplits(count: number) {
  if (count <= 1) return [];
  return Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);
}

function buildStops(count: number, splits: number[]) {
  if (count <= 1) return [0, 1];
  const trimmed = splits.slice(0, count - 1).map((value) => clampValue(value, 0, 1));
  return [0, ...trimmed, 1];
}

function buildFractions(stops: number[]) {
  return stops.slice(1).map((stop, index) => Math.max(0, stop - stops[index]));
}

function getMinGap(count: number) {
  return Math.min(0.05, 0.6 / Math.max(count, 1));
}

type ZipFileEntry = {
  name: string;
  data: Uint8Array;
};

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDate(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function buildZipBlob(files: ZipFileEntry[]) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const now = toDosDate(new Date());
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const size = file.data.length;
    const crc = crc32(file.data);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, now.dosTime, true);
    localView.setUint16(12, now.dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    parts.push(localHeader, nameBytes, file.data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, now.dosTime, true);
    centralView.setUint16(14, now.dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + size;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...parts, ...centralParts, endRecord], { type: 'application/zip' });
}

interface SliceItem {
  id: string;
  index: number;
  dataUrl: string;
  blob: Blob | null;
  selected: boolean;
  enhanced: boolean;
  row: number;
  col: number;
  width: number;
  height: number;
  enhancedDataUrl?: string;
  enhancing?: boolean;
  enhanceModel?: string;
  enhanceProgress?: number;
  enhanceError?: string;
}

interface TimelineItem {
  id: string;
  label: string;
  imageUrl: string;
  generation?: Generation;
}

export function SlicerPage(props: {
  models: ModelInfo[];
  onOpenProviderSettings: () => void;
  onUseAsReference?: (files: File[]) => void;
  onUseAsVideoReference?: (files: File[]) => void;
}) {
  // 主图状态
  const [masterImage, setMasterImage] = useState<string | null>(null);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // 切割配置
  const [sliceModeId, setSliceModeId] = useState(SLICE_MODES[0].id);
  const [customRows, setCustomRows] = useState(3);
  const [customCols, setCustomCols] = useState(3);
  const [customRowSplits, setCustomRowSplits] = useState(buildEvenSplits(3));
  const [customColSplits, setCustomColSplits] = useState(buildEvenSplits(3));
  const [slices, setSlices] = useState<SliceItem[]>([]);

  // 时间轴
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);

  // 增强处理
  const [enhanceModel, setEnhanceModel] = useState(ENHANCE_DEFAULT_MODEL);
  const [enhanceAspectRatio, setEnhanceAspectRatio] = useState(ENHANCE_ASPECT_RATIO);
  const [enhanceImageSize, setEnhanceImageSize] = useState(ENHANCE_IMAGE_SIZE);
  const [processingArea, setProcessingArea] = useState<SliceItem[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [videoPickerSelectedId, setVideoPickerSelectedId] = useState<string | null>(null);
  const [previewSliceId, setPreviewSliceId] = useState<string | null>(null);

  // 处理区域拖拽排序状态
  const [processingDragIndex, setProcessingDragIndex] = useState<number | null>(null);

  // 历史生成记录
  const [generations, setGenerations] = useState<Generation[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterCanvasRef = useRef<HTMLCanvasElement>(null);
  const masterPreviewRef = useRef<HTMLDivElement>(null);
  const sliceContainerRef = useRef<HTMLDivElement>(null);
  const gridOverlayRef = useRef<HTMLDivElement>(null);

  const [draggingLine, setDraggingLine] = useState<{ axis: 'row' | 'col'; index: number } | null>(null);
  const [gridDisplay, setGridDisplay] = useState<{ colSizes: number[]; rowSizes: number[] }>({
    colSizes: [],
    rowSizes: [],
  });
  const [masterPreviewSize, setMasterPreviewSize] = useState<{ width: number; height: number } | null>(null);

  const isCustomMode = sliceModeId === CUSTOM_MODE_ID;
  const activeMode = SLICE_MODES.find((mode) => mode.id === sliceModeId) ?? SLICE_MODES[0];
  const gridRowCount = isCustomMode ? customRows : activeMode.rows;
  const gridColCount = isCustomMode ? customCols : activeMode.cols;

  const rowSplits = useMemo(
    () => (isCustomMode ? customRowSplits : buildEvenSplits(gridRowCount)),
    [isCustomMode, customRowSplits, gridRowCount]
  );
  const colSplits = useMemo(
    () => (isCustomMode ? customColSplits : buildEvenSplits(gridColCount)),
    [isCustomMode, customColSplits, gridColCount]
  );
  const rowStops = useMemo(() => buildStops(gridRowCount, rowSplits), [gridRowCount, rowSplits]);
  const colStops = useMemo(() => buildStops(gridColCount, colSplits), [gridColCount, colSplits]);
  const rowFractions = useMemo(() => buildFractions(rowStops), [rowStops]);
  const colFractions = useMemo(() => buildFractions(colStops), [colStops]);
  const gridLabel = isCustomMode ? `${gridRowCount}×${gridColCount}` : activeMode.label;
  const gridColumnTemplate = gridDisplay.colSizes.length === gridColCount
    ? gridDisplay.colSizes.map((size) => `${size}px`).join(' ')
    : `repeat(${gridColCount}, minmax(0, 1fr))`;
  const gridRowTemplate = gridDisplay.rowSizes.length === gridRowCount
    ? gridDisplay.rowSizes.map((size) => `${size}px`).join(' ')
    : `repeat(${gridRowCount}, minmax(0, 1fr))`;
  const enhanceModelOptions = useMemo(
    () => (props.models || []).filter((m) => m.type === 'image'),
    [props.models]
  );
  const fallbackEnhanceModelId = enhanceModelOptions.find((m) => m.id === ENHANCE_DEFAULT_MODEL)?.id
    || enhanceModelOptions[0]?.id
    || ENHANCE_DEFAULT_MODEL;
  const previewStyle = masterPreviewSize
    ? { width: masterPreviewSize.width, height: masterPreviewSize.height }
    : undefined;
  const previewImageClass = masterPreviewSize
    ? 'w-full h-full object-contain rounded-lg ring-2 ring-indigo-500/30'
    : 'max-w-full max-h-full object-contain rounded-lg ring-2 ring-indigo-500/30';
  const previewSliceIndex = useMemo(
    () => processingArea.findIndex((item) => item.id === previewSliceId),
    [processingArea, previewSliceId]
  );
  const previewSlice = previewSliceIndex >= 0 ? processingArea[previewSliceIndex] : null;
  const previewGeneration = useMemo<Generation | null>(() => {
    if (!previewSlice) return null;
    const now = Date.now();
    return {
      id: previewSlice.id,
      type: 'image',
      prompt: previewSlice.enhanced ? ENHANCE_PRESET_PROMPT : '切片预览',
      model: previewSlice.enhanceModel || enhanceModel,
      status: previewSlice.enhancing ? 'running' : previewSlice.enhanced ? 'succeeded' : 'queued',
      createdAt: now,
      updatedAt: now,
      imageSize: enhanceImageSize,
      aspectRatio: enhanceAspectRatio,
    };
  }, [previewSlice, enhanceModel, enhanceImageSize, enhanceAspectRatio]);

  useEffect(() => {
    if (!enhanceModelOptions.length) return;
    if (!enhanceModelOptions.find((m) => m.id === enhanceModel)) {
      setEnhanceModel(fallbackEnhanceModelId);
    }
  }, [enhanceModelOptions, enhanceModel, fallbackEnhanceModelId]);

  useEffect(() => {
    if (!previewSliceId) return;
    if (previewSliceIndex < 0) setPreviewSliceId(null);
  }, [previewSliceId, previewSliceIndex]);

  // 加载历史图片生成记录
  useEffect(() => {
    loadGenerations();
  }, []);

  // 动态计算切片显示尺寸（基于图片比例）
  useEffect(() => {
    const container = sliceContainerRef.current;
    if (!container) return;

    const calculateSize = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      const gap = 4; // gap-1 = 4px
      const edge = 8;
      const availableWidth = containerWidth - (gridColCount - 1) * gap - edge * 2;
      const availableHeight = containerHeight - (gridRowCount - 1) * gap - edge * 2;

      if (availableWidth <= 0 || availableHeight <= 0) return;

      const baseWidth = imageDimensions?.width || gridColCount;
      const baseHeight = imageDimensions?.height || gridRowCount;

      const rawColSizes = colFractions.map((f) => f * baseWidth);
      const rawRowSizes = rowFractions.map((f) => f * baseHeight);

      const totalWidth = rawColSizes.reduce((sum, value) => sum + value, 0);
      const totalHeight = rawRowSizes.reduce((sum, value) => sum + value, 0);

      if (totalWidth === 0 || totalHeight === 0) return;

      const scale = Math.min(availableWidth / totalWidth, availableHeight / totalHeight);
      const cappedScale = Math.min(scale, 1.2);

      const colSizes = rawColSizes.map((w) => Math.max(1, Math.round(w * cappedScale)));
      const rowSizes = rawRowSizes.map((h) => Math.max(1, Math.round(h * cappedScale)));

      setGridDisplay({ colSizes, rowSizes });
    };

    calculateSize();

    const resizeObserver = new ResizeObserver(calculateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [gridColCount, gridRowCount, colFractions, rowFractions, imageDimensions]);

  // 计算主图显示尺寸，避免非常规比例被裁切
  useEffect(() => {
    const container = masterPreviewRef.current;
    if (!container) return;

    const calculatePreviewSize = () => {
      if (!imageDimensions) {
        setMasterPreviewSize(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const padding = 16; // p-4
      const availableWidth = Math.max(0, rect.width - padding * 2);
      const availableHeight = Math.max(0, rect.height - padding * 2);
      if (availableWidth === 0 || availableHeight === 0) return;

      const scale = Math.min(
        availableWidth / imageDimensions.width,
        availableHeight / imageDimensions.height
      );
      const width = Math.max(1, Math.floor(imageDimensions.width * scale));
      const height = Math.max(1, Math.floor(imageDimensions.height * scale));
      setMasterPreviewSize({ width, height });
    };

    calculatePreviewSize();

    const resizeObserver = new ResizeObserver(calculatePreviewSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [imageDimensions]);

  async function loadGenerations() {
    try {
      const res = await api.listGenerations({ type: 'image', limit: 50 });
      // 防御性检查：确保 res 和 res.items 不为 null
      if (res && res.items && Array.isArray(res.items)) {
        setGenerations(res.items.filter(g => g.status === 'succeeded' && g.outputFile));
      } else {
        setGenerations([]);
      }
    } catch (e) {
      console.error('Failed to load generations:', e);
      setGenerations([]);
    }
  }

  const updateCustomRows = useCallback((value: number) => {
    const safeValue = Number.isFinite(value) ? value : 1;
    const next = clampValue(safeValue, 1, MAX_CUSTOM_GRID);
    setCustomRows(next);
    setCustomRowSplits(buildEvenSplits(next));
  }, []);

  const updateCustomCols = useCallback((value: number) => {
    const safeValue = Number.isFinite(value) ? value : 1;
    const next = clampValue(safeValue, 1, MAX_CUSTOM_GRID);
    setCustomCols(next);
    setCustomColSplits(buildEvenSplits(next));
  }, []);

  const resetCustomSplits = useCallback(() => {
    setCustomRowSplits(buildEvenSplits(customRows));
    setCustomColSplits(buildEvenSplits(customCols));
  }, [customRows, customCols]);

  const updateRowSplit = useCallback(
    (index: number, value: number) => {
      setCustomRowSplits((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const minGap = getMinGap(customRows);
        const lowerBound = index === 0 ? 0 : next[index - 1];
        const upperBound = index === next.length - 1 ? 1 : next[index + 1];
        next[index] = clampValue(value, lowerBound + minGap, upperBound - minGap);
        return next;
      });
    },
    [customRows]
  );

  const updateColSplit = useCallback(
    (index: number, value: number) => {
      setCustomColSplits((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const minGap = getMinGap(customCols);
        const lowerBound = index === 0 ? 0 : next[index - 1];
        const upperBound = index === next.length - 1 ? 1 : next[index + 1];
        next[index] = clampValue(value, lowerBound + minGap, upperBound - minGap);
        return next;
      });
    },
    [customCols]
  );

  useEffect(() => {
    if (!draggingLine) return;

    const handleMove = (event: PointerEvent) => {
      const overlay = gridOverlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      if (draggingLine.axis === 'col') {
        const ratio = (event.clientX - rect.left) / rect.width;
        updateColSplit(draggingLine.index, clampValue(ratio, 0.01, 0.99));
      } else {
        const ratio = (event.clientY - rect.top) / rect.height;
        updateRowSplit(draggingLine.index, clampValue(ratio, 0.01, 0.99));
      }
    };

    const handleUp = () => setDraggingLine(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingLine, updateColSplit, updateRowSplit]);

  // 处理图片上传
  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setMasterImage(dataUrl);
      setMasterFile(file);

      // 获取图片尺寸
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
      };
      img.src = dataUrl;

      // 清空之前的切片，但保留处理区域
      setSlices([]);
      // 不清空 processingArea，保留已添加的图片
    };
    reader.readAsDataURL(file);
  }, []);

  // 从历史记录加载图片
  const handleLoadFromHistory = useCallback((generation: Generation) => {
    if (generation.outputFile) {
      const url = buildFileUrl(generation.outputFile.id);
      setMasterImage(url);
      setMasterFile(null);

      // 获取图片尺寸
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
      };
      img.src = url;

      // 清空之前的切片，但保留处理区域
      setSlices([]);
      // 不清空 processingArea，保留已添加的图片
    }
  }, []);

  // 执行切割
  const performSlice = useCallback(async () => {
    if (!masterImage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const rowSizes = rowFractions.map((fraction) => fraction * img.height);
      const colSizes = colFractions.map((fraction) => fraction * img.width);

      const newSlices: SliceItem[] = [];
      let y = 0;

      for (let row = 0; row < gridRowCount; row++) {
        const startY = Math.round(y);
        const nextY = row === gridRowCount - 1 ? img.height : Math.round(y + rowSizes[row]);
        const sliceHeight = Math.max(1, nextY - startY);
        y = nextY;

        let x = 0;
        for (let col = 0; col < gridColCount; col++) {
          const startX = Math.round(x);
          const nextX = col === gridColCount - 1 ? img.width : Math.round(x + colSizes[col]);
          const sliceWidth = Math.max(1, nextX - startX);
          x = nextX;

          const canvas = document.createElement('canvas');
          canvas.width = sliceWidth;
          canvas.height = sliceHeight;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(
              img,
              startX, startY,
              sliceWidth, sliceHeight,
              0, 0,
              sliceWidth, sliceHeight
            );

            canvas.toBlob((blob) => {
              const index = row * gridColCount + col;
              newSlices[index] = {
                id: `slice-${Date.now()}-${index}`,
                index,
                dataUrl: canvas.toDataURL('image/png'),
                blob,
                selected: false,
                enhanced: false,
                row,
                col,
                width: sliceWidth,
                height: sliceHeight,
              };

              if (newSlices.filter(Boolean).length === gridRowCount * gridColCount) {
                setSlices([...newSlices]);

                // 添加到时间轴
                const timelineItem: TimelineItem = {
                  id: `timeline-${Date.now()}`,
                  label: `SH${timelineItems.length + 1}`,
                  imageUrl: masterImage!,
                };
                setTimelineItems(prev => [...prev, timelineItem]);
              }
            }, 'image/png');
          }
        }
      }
    };

    img.src = masterImage;
  }, [masterImage, rowFractions, colFractions, gridRowCount, gridColCount, timelineItems.length]);

  // 切换切片选择状态
  const toggleSliceSelection = useCallback((sliceId: string) => {
    setSlices(prev => prev.map(s =>
      s.id === sliceId ? { ...s, selected: !s.selected } : s
    ));
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    const allSelected = slices.every(s => s.selected);
    setSlices(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  }, [slices]);

  // 添加选中的切片到处理区域
  const addToProcessingArea = useCallback(() => {
    const selectedSlices = slices.filter(s => s.selected);
    setProcessingArea(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newItems = selectedSlices.filter(s => !existingIds.has(s.id));
      return [...prev, ...newItems];
    });
  }, [slices]);

  // 从处理区域移除
  const removeFromProcessingArea = useCallback((sliceId: string) => {
    setProcessingArea(prev => prev.filter(p => p.id !== sliceId));
  }, []);

  // 处理区域拖拽排序
  const handleProcessingDragStart = useCallback((e: React.DragEvent, index: number) => {
    setProcessingDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-processing-reorder', String(index));
  }, []);

  const handleProcessingDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleProcessingDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (processingDragIndex === null || processingDragIndex === dropIndex) {
      setProcessingDragIndex(null);
      return;
    }

    setProcessingArea(prev => {
      const copy = [...prev];
      const [dragged] = copy.splice(processingDragIndex, 1);
      copy.splice(dropIndex, 0, dragged);
      return copy;
    });
    setProcessingDragIndex(null);
  }, [processingDragIndex]);

  const handleProcessingDragEnd = useCallback(() => {
    setProcessingDragIndex(null);
  }, []);

  const buildSliceFile = useCallback(async (slice: SliceItem, index: number) => {
    const dataUrl = slice.enhancedDataUrl || slice.dataUrl;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], `slice_${index + 1}.png`, { type: 'image/png' });
  }, []);

  const waitForGeneration = useCallback(async (generationId: string, onProgress?: (progress: number) => void) => {
    for (let attempt = 0; attempt < ENHANCE_POLL_MAX_ATTEMPTS; attempt++) {
      let gen: Generation | null = null;
      try {
        gen = await api.getGeneration(generationId);
      } catch (err) {
        console.error('Failed to fetch generation status:', err);
        await new Promise(resolve => setTimeout(resolve, ENHANCE_POLL_INTERVAL));
        continue;
      }
      if (typeof gen.progress === 'number') {
        const normalized = gen.progress <= 1 ? gen.progress * 100 : gen.progress;
        const clamped = Math.max(0, Math.min(100, normalized));
        if (onProgress) onProgress(clamped);
      }
      if (gen.status === 'succeeded' || gen.status === 'failed') return gen;
      await new Promise(resolve => setTimeout(resolve, ENHANCE_POLL_INTERVAL));
    }
    throw new Error('生成超时');
  }, []);

  // 执行增强处理（真实请求）
  const performEnhance = useCallback(async () => {
    if (processingArea.length === 0) return;

    setIsEnhancing(true);
    const queue = [...processingArea];

    const resolvedEnhanceModel = enhanceModelOptions.find((m) => m.id === enhanceModel)
      ? enhanceModel
      : fallbackEnhanceModelId;

    for (let i = 0; i < queue.length; i++) {
      const slice = queue[i];

      setProcessingArea(prev => prev.map(p =>
        p.id === slice.id ? { ...p, enhancing: true, enhanceProgress: 0, enhanceError: undefined } : p
      ));

      try {
        const file = await buildSliceFile(slice, i);
        const res = await api.generateImages({
          prompt: ENHANCE_PRESET_PROMPT,
          model: resolvedEnhanceModel,
          imageSize: enhanceImageSize,
          aspectRatio: enhanceAspectRatio,
          batch: 1,
          orderedReferences: [{ file }],
        });

        const generationId = res?.created?.[0]?.id;
        if (!generationId) throw new Error('生成任务创建失败');

        const gen = await waitForGeneration(generationId, (progress) => {
          setProcessingArea(prev => prev.map(p =>
            p.id === slice.id ? { ...p, enhanceProgress: progress } : p
          ));
        });
        if (gen.status !== 'succeeded' || !gen.outputFile?.id) {
          const msg = gen.error || '生成失败';
          setProcessingArea(prev => prev.map(p =>
            p.id === slice.id ? { ...p, enhancing: false, enhanceError: msg, enhanceProgress: undefined } : p
          ));
          break;
        }

        const resultUrl = buildFileUrl(gen.outputFile.id);
        setProcessingArea(prev => prev.map(p =>
          p.id === slice.id ? { ...p, enhancing: false, enhanced: true, enhancedDataUrl: resultUrl, enhanceModel: resolvedEnhanceModel, enhanceProgress: 100 } : p
        ));
        setSlices(prev => prev.map(s =>
          s.id === slice.id ? { ...s, enhanced: true, enhancedDataUrl: resultUrl, enhanceModel: resolvedEnhanceModel } : s
        ));
      } catch (err: any) {
        console.error('Enhance failed:', err);
        const msg = err?.message || '生成失败';
        setProcessingArea(prev => prev.map(p =>
          p.id === slice.id ? { ...p, enhancing: false, enhanceProgress: undefined, enhanceError: msg } : p
        ));
        break;
      }
    }

    setIsEnhancing(false);
  }, [
    processingArea,
    enhanceModel,
    enhanceAspectRatio,
    enhanceImageSize,
    enhanceModelOptions,
    fallbackEnhanceModelId,
    buildSliceFile,
    waitForGeneration,
  ]);

  // 批量下载 - 按处理区域顺序命名 1, 2, 3...
  const downloadSelected = useCallback(async () => {
    const toDownload = processingArea.filter(p => p.enhanced || p.dataUrl);

    if (toDownload.length === 0) return;

    // 始终使用压缩包下载，按顺序命名 1, 2, 3...
    const files = await Promise.all(
      toDownload.map(async (slice, idx) => {
        const dataUrl = slice.enhancedDataUrl || slice.dataUrl;
        const buffer = await (await fetch(dataUrl)).arrayBuffer();
        // 按处理区域顺序命名：1.png, 2.png, 3.png...
        return {
          name: `${idx + 1}.png`,
          data: new Uint8Array(buffer),
        };
      })
    );

    const zipBlob = buildZipBlob(files);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `slices_${stamp}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, [processingArea]);

  // 作为参考图使用（图片生成）
  const useAsReference = useCallback(async () => {
    if (processingArea.length === 0 || !props.onUseAsReference) return;

    const files: File[] = [];
    for (let i = 0; i < processingArea.length; i++) {
      files.push(await buildSliceFile(processingArea[i], i));
    }

    props.onUseAsReference(files);
  }, [buildSliceFile, processingArea, props.onUseAsReference]);

  // 作为参考图使用（视频生成）
  const useAsVideoReference = useCallback(async () => {
    if (processingArea.length === 0 || !props.onUseAsVideoReference) return;
    if (processingArea.length === 1) {
      const file = await buildSliceFile(processingArea[0], 0);
      props.onUseAsVideoReference([file]);
      return;
    }
    setVideoPickerSelectedId(processingArea[0]?.id || null);
    setVideoPickerOpen(true);
  }, [buildSliceFile, processingArea, props.onUseAsVideoReference]);

  const confirmVideoReference = useCallback(async () => {
    if (!props.onUseAsVideoReference || !videoPickerSelectedId) return;
    const index = processingArea.findIndex((item) => item.id === videoPickerSelectedId);
    if (index < 0) return;
    const file = await buildSliceFile(processingArea[index], index);
    props.onUseAsVideoReference([file]);
    setVideoPickerOpen(false);
  }, [buildSliceFile, processingArea, props.onUseAsVideoReference, videoPickerSelectedId]);

  // 保存当前图片
  const saveCurrentImage = useCallback(() => {
    if (!masterImage) return;

    const link = document.createElement('a');
    link.href = masterImage;
    link.download = `master_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [masterImage]);

  // 一键添加到处理区域
  const addAllToProcessing = useCallback(() => {
    setProcessingArea(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newItems = slices.filter(s => !existingIds.has(s.id));
      return [...prev, ...newItems];
    });
  }, [slices]);

  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      {/* 主内容区域 - 固定高度 */}
      <div className="h-[60%] min-h-[320px] flex">
        {/* 左侧：主图区域 */}
        <div className="w-[38%] min-w-[360px] border-r border-white/5 p-4 flex flex-col">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100 tracking-wider">总览</span>
            </div>
            <button
              onClick={saveCurrentImage}
              disabled={!masterImage}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
            >
              <span>↓</span>
              <span>保存当前</span>
            </button>
          </div>

          {/* 切割模式选择 */}
          <div className="flex items-center gap-2 mb-4">
            {SLICE_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => setSliceModeId(mode.id)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${sliceModeId === mode.id
                  ? 'bg-indigo-600/50 text-white ring-1 ring-indigo-400/50'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {isCustomMode && (
            <div className="mb-4 rounded-xl bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">行</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_CUSTOM_GRID}
                    value={customRows}
                    onChange={(e) => updateCustomRows(Number.parseInt(e.target.value, 10))}
                    className="w-16 rounded-lg bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-white/20"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">列</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_CUSTOM_GRID}
                    value={customCols}
                    onChange={(e) => updateCustomCols(Number.parseInt(e.target.value, 10))}
                    className="w-16 rounded-lg bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-white/20"
                  />
                </div>
                <button
                  onClick={resetCustomSplits}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/20"
                >
                  均分重置
                </button>
                <span className="text-[11px] text-zinc-500">拖动网格线可微调</span>
              </div>
            </div>
          )}

          {/* 主图显示区域 */}
          <div
            ref={masterPreviewRef}
            className="flex-1 min-h-0 relative rounded-xl overflow-hidden"
            style={{ background: 'rgba(30, 32, 40, 0.6)' }}
          >
            {masterImage ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="relative" style={previewStyle}>
                  <img
                    src={masterImage}
                    alt="Master"
                    className={previewImageClass}
                  />
                  {/* 网格覆盖 */}
                  <div
                    ref={gridOverlayRef}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {colStops.slice(1, -1).map((stop, idx) => (
                      <div
                        key={`col-${idx}`}
                        className="absolute top-0 bottom-0 border-l-2 border-indigo-500/90"
                        style={{ left: `${stop * 100}%` }}
                      >
                        {isCustomMode && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-indigo-500/80 ring-2 ring-indigo-200/70 cursor-col-resize pointer-events-auto"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDraggingLine({ axis: 'col', index: idx });
                            }}
                          />
                        )}
                      </div>
                    ))}
                    {rowStops.slice(1, -1).map((stop, idx) => (
                      <div
                        key={`row-${idx}`}
                        className="absolute left-0 right-0 border-t-2 border-indigo-500/90"
                        style={{ top: `${stop * 100}%` }}
                      >
                        {isCustomMode && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-indigo-500/80 ring-2 ring-indigo-200/70 cursor-row-resize pointer-events-auto"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDraggingLine({ axis: 'row', index: idx });
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {/* 尺寸标签 */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
                    <div className="text-2xl font-bold text-indigo-400/80">{gridLabel}</div>
                    {imageDimensions && (
                      <div className="text-lg text-indigo-400/60">{imageDimensions.width}x{imageDimensions.height}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl text-zinc-600 mb-4">+</div>
                <div className="text-sm text-zinc-500">点击上传图片或从下方时间线选择</div>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5 rounded-xl bg-white/5 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
            >
              上传图片
            </button>
            <button
              onClick={performSlice}
              disabled={!masterImage}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600/50 text-sm font-medium text-white hover:bg-indigo-600/70 disabled:opacity-50 transition-colors"
            >
              执行切割
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImageUpload(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />
        </div>

        {/* 右侧：切片显示区域 */}
        <div className="flex-1 min-h-0 p-2 flex flex-col">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100 tracking-wider">分割</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{slices.length} 张</span>
              {slices.length > 0 && (
                <>
                  <button
                    onClick={toggleSelectAll}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-white bg-white/5 rounded-lg hover:bg-white/10"
                  >
                    {slices.every(s => s.selected) ? '取消全选' : '全选'}
                  </button>
                  <button
                    onClick={addAllToProcessing}
                    className="px-2 py-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 rounded-lg hover:bg-indigo-500/20"
                  >
                    一键添加到处理区域
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 切片网格 - 动态尺寸 */}
          <div
            ref={sliceContainerRef}
            className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
          >
            {slices.length > 0 ? (
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: gridColumnTemplate,
                  gridTemplateRows: gridRowTemplate,
                }}
              >
                {slices.map((slice, idx) => (
                  <div
                    key={slice.id}
                    onClick={() => toggleSliceSelection(slice.id)}
                    className={`relative rounded overflow-hidden cursor-pointer transition-all ${slice.selected
                      ? 'ring-2 ring-indigo-500'
                      : 'ring-1 ring-white/10 hover:ring-white/30'
                      }`}
                    style={{
                      background: 'rgba(30, 32, 40, 0.8)',
                      gridRowStart: slice.row + 1,
                      gridColumnStart: slice.col + 1,
                    }}
                  >
                    <img
                      src={slice.enhancedDataUrl || slice.dataUrl}
                      alt={`Slice ${idx + 1}`}
                      className="w-full h-full object-contain"
                    />
                    {/* 序号标签 */}
                    <div className="absolute top-0.5 left-0.5 px-1 bg-black/70 rounded text-[9px] text-zinc-300">
                      #{idx + 1}
                    </div>
                    {/* 选中指示 */}
                    {slice.selected && (
                      <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-indigo-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px]">✓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl text-zinc-700 mb-2">--</div>
                  <div className="text-xs text-zinc-500">切割后的图片将显示在这里</div>
                </div>
              </div>
            )}
          </div>

          {/* 添加到处理区域按钮 */}
          {slices.some(s => s.selected) && (
            <div className="mt-4">
              <button
                onClick={addToProcessingArea}
                className="w-full py-2.5 rounded-xl bg-indigo-600/30 text-sm text-indigo-300 hover:bg-indigo-600/50 transition-colors"
              >
                添加选中 ({slices.filter(s => s.selected).length}) 到处理区域
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 时间轴区域 */}
      <div className="border-t border-white/5 p-3" style={{ background: 'rgba(15, 15, 18, 0.8)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-100 tracking-wider">时间线</span>
          </div>
          <button
            onClick={addAllToProcessing}
            disabled={slices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white bg-white/5 rounded-lg hover:bg-white/10 disabled:opacity-50"
          >
            <span>一键添加到处理区域</span>
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {/* 历史生成的图片 */}
          {(generations || []).slice(0, 10).map((gen, idx) => {
            const isSelected = selectedTimelineId === gen.id;
            return (
              <div
                key={gen.id}
                onClick={() => {
                  setSelectedTimelineId(gen.id);
                  handleLoadFromHistory(gen);
                }}
                className="flex-shrink-0 cursor-pointer"
              >
                <div className="text-[10px] text-zinc-500 mb-1 text-center">SH{idx + 1}</div>
                <div
                  className={`w-24 h-16 rounded-lg overflow-hidden ring-inset transition-all ${isSelected
                    ? 'ring-2 ring-indigo-500'
                    : 'ring-1 ring-white/10 opacity-70 hover:opacity-100'
                    }`}
                  style={{ background: 'rgba(30, 32, 40, 0.8)' }}
                >
                  {gen.outputFile && (
                    <img
                      src={buildFileUrl(gen.outputFile.id, { thumb: true })}
                      alt={`Shot ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            );
          })}

          {generations.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-4">
              <span className="text-xs text-zinc-500">暂无历史生成记录，请先在图片生成页面生成图片</span>
            </div>
          )}
        </div>
      </div>

      {/* 清晰化处理区域 */}
      <div className="border-t border-white/5 p-3" style={{ background: 'rgba(12, 12, 15, 0.9)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-400 tracking-wider">
              清晰化处理区域 {isEnhancing && <span className="text-amber-300">(PROCESSING)</span>}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 增强模型选择 */}
            <select
              value={enhanceModel}
              onChange={(e) => setEnhanceModel(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {enhanceModelOptions.length > 0 ? (
                enhanceModelOptions.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))
              ) : (
                <option value={ENHANCE_DEFAULT_MODEL}>nano banana</option>
              )}
            </select>

            <select
              value={enhanceAspectRatio}
              onChange={(e) => setEnhanceAspectRatio(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="比例"
              aria-label="比例"
            >
              {ENHANCE_ASPECT_OPTIONS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio === 'auto' ? '自动' : ratio}
                </option>
              ))}
            </select>

            <select
              value={enhanceImageSize}
              onChange={(e) => setEnhanceImageSize(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="分辨率"
              aria-label="分辨率"
            >
              {ENHANCE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            {/* 执行处理按钮 */}
            <button
              onClick={performEnhance}
              disabled={processingArea.length === 0 || isEnhancing}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isEnhancing && <Spinner size={12} />}
              <span>执行处理</span>
            </button>
          </div>
        </div>

        {/* 处理区域内容 */}
        <div
          className="min-h-[80px] rounded-xl p-3 flex items-center gap-3 overflow-x-auto custom-scrollbar"
          style={{ background: 'rgba(20, 20, 25, 0.8)', border: '1px dashed rgba(255,255,255,0.1)' }}
        >
          {processingArea.length > 0 ? (
            <>
              {processingArea.map((slice, idx) => (
                <div
                  key={slice.id}
                  className={`flex-shrink-0 relative group cursor-grab active:cursor-grabbing transition-transform ${processingDragIndex === idx ? 'opacity-50 scale-95' : ''}`}
                  draggable
                  onClick={() => setPreviewSliceId(slice.id)}
                  onDragStart={(e) => handleProcessingDragStart(e, idx)}
                  onDragOver={handleProcessingDragOver}
                  onDrop={(e) => handleProcessingDrop(e, idx)}
                  onDragEnd={handleProcessingDragEnd}
                >
                  <div
                    className={`w-16 h-16 rounded-lg overflow-hidden ${slice.enhanced ? 'ring-2 ring-green-500' : ''
                      } ${slice.enhancing ? 'animate-pulse' : ''}`}
                  >
                    <img
                      src={slice.enhancedDataUrl || slice.dataUrl}
                      alt={`Process ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 序号标签 */}
                  <div className="absolute bottom-0.5 left-0.5 px-1 bg-black/70 rounded text-[9px] font-bold text-white">
                    #{idx + 1}
                  </div>

                  {/* 状态标识 */}
                  {slice.enhancing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 rounded-lg">
                      <Spinner size={16} />
                      {typeof slice.enhanceProgress === 'number' ? (
                        <span className="text-[9px] text-zinc-200">{Math.round(slice.enhanceProgress)}%</span>
                      ) : null}
                    </div>
                  )}
                  {slice.enhancing && typeof slice.enhanceProgress === 'number' && (
                    <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.min(100, Math.max(0, slice.enhanceProgress))}%` }}
                      />
                    </div>
                  )}
                  {slice.enhanced && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[8px]">✓</span>
                    </div>
                  )}
                  {!slice.enhanced && slice.enhanceError && (
                    <div
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                      title={slice.enhanceError}
                    >
                      <span className="text-white text-[8px]">!</span>
                    </div>
                  )}

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromProcessingArea(slice.id);
                    }}
                    className="absolute -top-1 -left-1 w-4 h-4 bg-red-500/80 rounded-full text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* 操作按钮 */}
              <div className="flex-shrink-0 flex flex-col gap-2 ml-4">
                <button
                  onClick={downloadSelected}
                  disabled={processingArea.length === 0}
                  className="px-3 py-1.5 text-xs bg-indigo-600/50 text-white rounded-lg hover:bg-indigo-600/70 disabled:opacity-50"
                >
                  批量下载
                </button>
                <button
                  onClick={useAsReference}
                  disabled={processingArea.length === 0 || !props.onUseAsReference}
                  className="px-3 py-1.5 text-xs bg-green-600/50 text-white rounded-lg hover:bg-green-600/70 disabled:opacity-50"
                >
                  导入图片
                </button>
                <button
                  onClick={useAsVideoReference}
                  disabled={processingArea.length === 0 || !props.onUseAsVideoReference}
                  className="px-3 py-1.5 text-xs bg-sky-600/50 text-white rounded-lg hover:bg-sky-600/70 disabled:opacity-50"
                >
                  导入视频
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-xs text-zinc-500">点击上方图片或时间线图片添加到此处</span>
            </div>
          )}
        </div>

        {/* 网络速度指示 */}
      <div className="flex justify-end mt-2 gap-4 text-xs">
        <span className="text-green-400">↑ 43.1 KB/s</span>
        <span className="text-blue-400">↓ 14.1 KB/s</span>
      </div>
    </div>

      <ImagePreviewModal
        open={!!previewSlice}
        generation={previewGeneration}
        previewUrl={previewSlice ? (previewSlice.enhancedDataUrl || previewSlice.dataUrl) : undefined}
        onClose={() => setPreviewSliceId(null)}
        hasPrev={previewSliceIndex > 0}
        hasNext={previewSliceIndex >= 0 && previewSliceIndex < processingArea.length - 1}
        onPrev={() => {
          if (previewSliceIndex > 0) {
            setPreviewSliceId(processingArea[previewSliceIndex - 1].id);
          }
        }}
        onNext={() => {
          if (previewSliceIndex >= 0 && previewSliceIndex < processingArea.length - 1) {
            setPreviewSliceId(processingArea[previewSliceIndex + 1].id);
          }
        }}
      />

      <Modal
        open={videoPickerOpen}
        onClose={() => setVideoPickerOpen(false)}
        title="选择视频参考图"
        maxWidthClassName="max-w-4xl"
      >
        <div className="text-xs text-zinc-400">视频生成仅支持 1 张参考图，请选择一张继续。</div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {processingArea.map((slice) => {
            const selected = slice.id === videoPickerSelectedId;
            return (
              <button
                key={slice.id}
                onClick={() => setVideoPickerSelectedId(slice.id)}
                className={`relative overflow-hidden rounded-xl ring-1 ${selected ? 'ring-sky-400' : 'ring-white/10'} hover:ring-white/40`}
              >
                <img
                  src={slice.enhancedDataUrl || slice.dataUrl}
                  alt="视频参考图"
                  className="h-32 w-full object-cover"
                />
                {selected ? (
                  <div className="absolute right-2 top-2 rounded-full bg-sky-500/80 px-2 py-0.5 text-[10px] text-white">已选</div>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => setVideoPickerOpen(false)}
            className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={confirmVideoReference}
            disabled={!videoPickerSelectedId}
            className="rounded-lg bg-sky-600/70 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            确认导入
          </button>
        </div>
      </Modal>
    </div>
  );
}
