import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Image as ImageIcon, Download, Loader2, RefreshCw, Settings2, Camera, ChevronDown, ChevronUp, Aperture, Maximize, Move3d } from 'lucide-react';

/**
 * ============================================================================
 * 模拟 API 服务
 * ============================================================================
 */

interface Generation {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  outputFile?: { url: string };
  prompt: string;
}

const mockApi = {
  login: async () => {
    return { token: 'mock-token-123' };
  },
  generateImages: async (payload: any): Promise<{ created: Generation[] }> => {
    console.log('[API 调用] generateImages 参数:', payload);
    await new Promise(resolve => setTimeout(resolve, 2500)); // 稍长的延迟模拟沉重计算感
    return {
      created: [
        {
          id: `gen-${Date.now()}`,
          status: 'succeeded',
          prompt: payload.prompt,
          outputFile: {
            url: `https://picsum.photos/seed/${Date.now()}/1024/768` 
          }
        }
      ]
    };
  }
};

/**
 * ============================================================================
 * 提示词转换逻辑
 * ============================================================================
 */
const getCameraPrompts = (azimuth: number, elevation: number, distance: number) => {
  const parts = [];

  // 1. 方位角
  if (azimuth >= 315 || azimuth <= 45) parts.push('front view');
  else if (azimuth > 45 && azimuth < 135) parts.push('right side view, profile shot');
  else if (azimuth >= 135 && azimuth <= 225) parts.push('back view, from behind');
  else if (azimuth > 225 && azimuth < 315) parts.push('left side view, profile shot');

  // 2. 俯仰角
  if (elevation > 45) parts.push('top down view, bird\'s eye view');
  else if (elevation > 15) parts.push('high angle shot, looking down');
  else if (elevation < -15) parts.push('low angle shot, looking up, worm\'s eye view');
  else parts.push('eye-level shot');

  // 3. 距离
  if (distance < 0.8) parts.push('close-up shot, macro details');
  else if (distance > 1.2) parts.push('wide shot, long shot, full body');
  else parts.push('medium shot, upper body');

  return `<sks> ${parts.join(', ')}`;
};

/**
 * ============================================================================
 * 主应用组件
 * ============================================================================
 */
export default function App() {
  // --- State ---
  const [inputImage, setInputImage] = useState<File | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  
  const [prompt, setPrompt] = useState('一位身穿机能风外套的赛博朋克角色，站在雨夜的霓虹街道中');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // Camera Controls
  const [azimuth, setAzimuth] = useState(45);   
  const [elevation, setElevation] = useState(20); 
  const [distance, setDistance] = useState(1.0);  

  // Settings
  const [seed, setSeed] = useState(0);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [imageSize, setImageSize] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Computed Prompt
  const cameraPrompt = useMemo(() => getCameraPrompts(azimuth, elevation, distance), [azimuth, elevation, distance]);
  const finalPrompt = `${prompt}, ${cameraPrompt}`;

  // --- Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setInputImage(file);
      setInputImagePreview(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const payload = {
        prompt: finalPrompt,
        model: 'nano-banana-pro',
        imageSize: imageSize,
        aspectRatio: aspectRatio,
        batch: 1,
        orderedReferences: inputImage ? [{ file: inputImage }] : [],
      };
      const result = await mockApi.generateImages(payload);
      if (result.created && result.created.length > 0) {
        setGeneratedImage(result.created[0].outputFile?.url || null);
      }
    } catch (error) {
      console.error("生成失败:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full w-full overflow-hidden bg-[#050505] text-[#e5e5e5] font-sans selection:bg-amber-900 selection:text-amber-100">
      
      {/* 顶部导航栏 - 金属拉丝质感模拟 */}
      <header className="flex-shrink-0 border-b border-neutral-800 bg-[#0a0a0a] px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-neutral-700 to-black border border-neutral-600 flex items-center justify-center shadow-inner">
            <Camera size={16} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-neutral-200 uppercase" style={{ fontFamily: 'Arial, sans-serif' }}>
              Nano-Banana <span className="text-amber-600">Pro</span>
            </h1>
            <div className="text-[10px] text-neutral-500 tracking-[0.2em] uppercase">智能影像工作室</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-neutral-500">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-900 border border-green-600 animate-pulse"></span>
            内核加载完成
          </span>
          <span className="px-2 py-1 border border-neutral-800 rounded bg-[#0f0f0f]">V 2.5.11</span>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 min-h-0 overflow-auto p-4 lg:p-8">
        <div className="container mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左侧控制区 (5/12) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* 3D 视窗 (核心功能) */}
          <div className="bg-[#0f0f0f] border border-neutral-800 rounded-sm relative shadow-lg group">
             {/* 装饰性边角 */}
             <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-600/50"></div>
             <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-600/50"></div>
             <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-600/50"></div>
             <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-600/50"></div>

             <div className="h-[360px] relative bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1a1a] to-[#050505]">
                <div className="absolute top-4 left-4 z-10 flex flex-col">
                  <div className="text-neutral-300 font-bold flex items-center gap-2 text-xs uppercase tracking-widest">
                    <Move3d size={14} className="text-amber-600" />
                    3D 空间视窗
                  </div>
                  <div className="text-neutral-600 text-[10px] mt-1 font-mono">X: {azimuth}° | Y: {elevation}° | Z: {distance.toFixed(2)}</div>
                </div>

                <Visualizer3D azimuth={azimuth} elevation={elevation} distance={distance} imagePreview={inputImagePreview} />

                {/* 动态提示词浮层 */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/80 border-t border-neutral-800 backdrop-blur-sm p-3">
                   <div className="text-[10px] text-amber-600/70 mb-1 font-mono uppercase">系统生成的空间控制指令:</div>
                   <code className="text-xs text-neutral-400 font-mono block whitespace-nowrap overflow-hidden text-ellipsis">
                     {cameraPrompt}
                   </code>
                </div>
             </div>
          </div>

          {/* 参数控制台 */}
          <div className="bg-[#0f0f0f] border border-neutral-800 p-6 shadow-lg relative">
             <div className="flex items-center gap-2 mb-6 border-b border-neutral-800 pb-3">
                <Settings2 size={16} className="text-neutral-400" />
                <h3 className="text-sm font-bold text-neutral-200 tracking-wider uppercase">镜头参数配置</h3>
             </div>

             {/* 滑块样式自定义 */}
             <style>{`
               input[type=range] {
                 -webkit-appearance: none; 
                 background: transparent; 
               }
               input[type=range]::-webkit-slider-thumb {
                 -webkit-appearance: none;
                 height: 16px; width: 16px;
                 background: #171717;
                 border: 1px solid #d97706;
                 border-radius: 0;
                 cursor: pointer;
                 margin-top: -7px;
                 box-shadow: 0 0 10px rgba(217, 119, 6, 0.2);
               }
               input[type=range]::-webkit-slider-runnable-track {
                 width: 100%; height: 2px;
                 background: #333;
               }
               input[type=range]:focus::-webkit-slider-runnable-track { background: #444; }
             `}</style>

             <div className="space-y-8">
               {/* 方位角 */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                   <span className="text-neutral-400">方位角 (水平旋转)</span>
                   <span className="text-amber-600 font-mono">{azimuth}°</span>
                 </div>
                 <input type="range" min="0" max="360" value={azimuth} onChange={(e) => setAzimuth(parseInt(e.target.value))} className="w-full" />
                 <div className="flex justify-between text-[9px] text-neutral-700 font-mono uppercase tracking-widest">
                   <span>正前</span><span>右侧</span><span>正后</span><span>左侧</span><span>正前</span>
                 </div>
               </div>

               {/* 俯仰角 */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                   <span className="text-neutral-400">俯仰角 (垂直视角)</span>
                   <span className="text-amber-600 font-mono">{elevation}°</span>
                 </div>
                 <input type="range" min="-90" max="90" value={elevation} onChange={(e) => setElevation(parseInt(e.target.value))} className="w-full" />
               </div>

               {/* 距离 */}
               <div className="space-y-2">
                 <div className="flex justify-between text-xs">
                   <span className="text-neutral-400">焦距/距离 (缩放)</span>
                   <span className="text-amber-600 font-mono">{distance.toFixed(1)}x</span>
                 </div>
                 <input type="range" min="0.5" max="2.0" step="0.1" value={distance} onChange={(e) => setDistance(parseFloat(e.target.value))} className="w-full" />
               </div>
             </div>
          </div>

          {/* 参考图上传 */}
          <div className="bg-[#0f0f0f] border border-neutral-800 p-1 relative h-24 flex items-center">
             {inputImagePreview ? (
               <div className="w-full h-full relative flex items-center bg-[#050505] px-4 gap-4">
                 <img src={inputImagePreview} alt="Input" className="h-20 w-20 object-cover border border-neutral-700" />
                 <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-300 truncate font-mono">{inputImage?.name || 'reference.jpg'}</div>
                    <div className="text-[10px] text-neutral-600 mt-1">已加载为空间参考底图</div>
                 </div>
                 <button 
                    onClick={() => { setInputImage(null); setInputImagePreview(null); }}
                    className="p-2 hover:bg-red-900/20 text-neutral-500 hover:text-red-500 transition-colors"
                 >
                   <RefreshCw size={14} />
                 </button>
               </div>
             ) : (
               <label className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-neutral-900 transition-colors border border-dashed border-neutral-800 hover:border-neutral-600 gap-3">
                 <Upload size={16} className="text-neutral-500" />
                 <span className="text-xs text-neutral-400">上传参考图片 (可选)</span>
                 <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
               </label>
             )}
          </div>
        </div>

        {/* 右侧输出区 (7/12) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* 生成结果展示 */}
          <div className="flex-1 bg-[#0f0f0f] border border-neutral-800 min-h-[500px] relative flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-8 flex items-center px-4 border-b border-neutral-800 bg-[#141414] justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    <Aperture size={12} /> 渲染视窗
                </div>
                <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-neutral-800"></div>
                    <div className="w-2 h-2 rounded-full bg-neutral-800"></div>
                    <div className="w-2 h-2 rounded-full bg-neutral-800"></div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center bg-[#050505] p-6 relative overflow-hidden">
              {/* 背景网格装饰 */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#222 1px, transparent 1px), linear-gradient(90deg, #222 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

              {generatedImage ? (
                <div className="relative z-10 shadow-2xl shadow-black">
                  <img 
                    src={generatedImage} 
                    alt="Generated" 
                    className="max-w-full max-h-[600px] border border-neutral-800" 
                  />
                  <div className="absolute -bottom-10 right-0 flex gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs border border-neutral-700 transition-colors">
                        <Download size={14} /> 保存图像
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-neutral-600 z-10">
                  {isGenerating ? (
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 border-2 border-neutral-800 border-t-amber-600 rounded-full animate-spin mb-4"></div>
                      <span className="text-amber-600 text-xs tracking-widest uppercase font-bold">渲染引擎计算中...</span>
                      <span className="text-[10px] text-neutral-500 mt-2 font-mono">Processing Tensor Cores</span>
                    </div>
                  ) : (
                    <>
                      <Maximize size={48} className="text-neutral-800 mb-4 stroke-1" />
                      <p className="text-xs tracking-widest uppercase">等待生成指令</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部输入栏 */}
          <div className="bg-[#0f0f0f] border border-neutral-800 p-6">
             <div className="flex justify-between items-end mb-3">
                 <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">提示词指令 (Prompt)</label>
                 <button 
                   onClick={() => setShowAdvanced(!showAdvanced)}
                   className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-amber-600 transition-colors uppercase tracking-wider"
                 >
                   {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                   高级配置
                 </button>
             </div>
             
             <div className="relative">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 text-neutral-300 text-sm p-4 h-24 focus:outline-none focus:border-amber-700/50 transition-colors font-mono resize-none leading-relaxed"
                  placeholder="在此输入画面描述..."
                />
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-600">
                    {prompt.length} chars
                </div>
             </div>

             {/* 高级设置面板 */}
             {showAdvanced && (
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-neutral-800 animate-in fade-in slide-in-from-top-1">
                 <div className="space-y-1">
                   <label className="text-[10px] text-neutral-500 uppercase">随机种子 (Seed)</label>
                   <div className="flex">
                     <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value))} className="w-full bg-[#050505] border border-neutral-800 text-xs px-2 py-1 text-neutral-400 focus:border-amber-900 outline-none" />
                     <button onClick={() => setRandomizeSeed(!randomizeSeed)} className={`px-2 border border-l-0 border-neutral-800 ${randomizeSeed ? 'text-amber-600 bg-amber-900/10' : 'text-neutral-600'}`}>
                       <RefreshCw size={10} />
                     </button>
                   </div>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] text-neutral-500 uppercase">引导系数 (CFG)</label>
                   <input type="number" step="0.5" value={guidanceScale} onChange={(e) => setGuidanceScale(parseFloat(e.target.value))} className="w-full bg-[#050505] border border-neutral-800 text-xs px-2 py-1 text-neutral-400 focus:border-amber-900 outline-none" />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] text-neutral-500 uppercase">画面比例</label>
                   <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-[#050505] border border-neutral-800 text-xs px-2 py-1 text-neutral-400 focus:border-amber-900 outline-none">
                     <option value="auto">Auto (自动)</option>
                     <option value="1:1">1:1 (正方形)</option>
                     <option value="16:9">16:9 (横向)</option>
                     <option value="9:16">9:16 (竖向)</option>
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] text-neutral-500 uppercase">分辨率</label>
                   <select value={imageSize} onChange={(e) => setImageSize(e.target.value)} className="w-full bg-[#050505] border border-neutral-800 text-xs px-2 py-1 text-neutral-400 focus:border-amber-900 outline-none">
                     <option value="1K">1K 标准</option>
                     <option value="2K">2K 高清</option>
                     <option value="4K">4K 超清</option>
                   </select>
                 </div>
               </div>
             )}

             <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`mt-6 w-full py-3 text-xs font-bold tracking-[0.2em] uppercase transition-all
                  ${isGenerating 
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' 
                    : 'bg-gradient-to-b from-neutral-800 to-black hover:from-neutral-700 hover:to-neutral-900 text-amber-500 border border-neutral-700 hover:border-amber-800 hover:text-amber-400 shadow-[0_4px_10px_rgba(0,0,0,0.5)]'
                  }`}
             >
                {isGenerating ? '正在执行渲染指令...' : '启动生成 (Execute)'}
             </button>
          </div>

        </div>
        </div>
      </main>
    </div>
  );
}

/**
 * ============================================================================
 * 3D 可视化组件 (Canvas) - 黑色金属风格重绘
 * ============================================================================
 */
function Visualizer3D({ azimuth, elevation, distance, imagePreview }: { azimuth: number, elevation: number, distance: number, imagePreview: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (imagePreview) {
      const img = new Image();
      img.src = imagePreview;
      img.onload = () => setLoadedImage(img);
    } else {
      setLoadedImage(null);
    }
  }, [imagePreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);
    
    // Math
    const azRad = (azimuth - 90) * (Math.PI / 180);
    const elRad = elevation * (Math.PI / 180);
    
    // 1. 绘制地板网格 (极简暗色风格)
    ctx.save();
    ctx.translate(centerX, centerY + 30);
    ctx.scale(1, 0.4); 
    
    // 轨道圈 - 暗灰金属色
    ctx.beginPath();
    ctx.strokeStyle = '#404040'; // Neutral-700
    ctx.lineWidth = 2;
    // 去掉发光，使用硬朗线条
    ctx.shadowBlur = 0;
    
    const baseRadius = 90;
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // 内部网格 - 几乎不可见的深色
    ctx.strokeStyle = '#262626'; // Neutral-800
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i = -180; i <= 180; i+=30) {
        ctx.moveTo(i, -180); ctx.lineTo(i, 180);
        ctx.moveTo(-180, i); ctx.lineTo(180, i);
    }
    ctx.stroke();
    ctx.restore();

    // 2. 绘制目标主体 (中心立牌)
    ctx.save();
    ctx.translate(centerX, centerY);
    // 切变变换模拟 3D 侧视
    ctx.transform(0.9, 0.25, 0, 1, 0, 0); 

    const boxW = 80;
    const boxH = 80;
    const thickness = 8; 

    // 倒影 - 非常微弱
    ctx.save();
    ctx.transform(1, 0, -0.5, 0.3, 0, boxH/2 + 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'; // 极弱白光
    ctx.fillRect(-boxW/2, -boxH/2, boxW, boxH);
    ctx.restore();

    // 厚度 (侧面) - 纯黑/深灰
    ctx.fillStyle = '#171717'; 
    ctx.beginPath();
    ctx.moveTo(boxW/2, -boxH/2);
    ctx.lineTo(boxW/2 + thickness, -boxH/2 - thickness/2);
    ctx.lineTo(boxW/2 + thickness, boxH/2 - thickness/2);
    ctx.lineTo(boxW/2, boxH/2);
    ctx.fill();
    
    // 厚度 (顶面)
    ctx.fillStyle = '#262626'; 
    ctx.beginPath();
    ctx.moveTo(-boxW/2, -boxH/2);
    ctx.lineTo(boxW/2, -boxH/2);
    ctx.lineTo(boxW/2 + thickness, -boxH/2 - thickness/2);
    ctx.lineTo(-boxW/2 + thickness, -boxH/2 - thickness/2);
    ctx.fill();

    // 正面内容
    if (loadedImage) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-boxW/2, -boxH/2, boxW, boxH);
        ctx.clip();
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(-boxW/2, -boxH/2, boxW, boxH);
        const scale = Math.min(boxW / loadedImage.width, boxH / loadedImage.height);
        const w = loadedImage.width * scale;
        const h = loadedImage.height * scale;
        ctx.drawImage(loadedImage, -w/2, -h/2, w, h);
        ctx.restore();
        // 边框 - 金色微光
        ctx.strokeStyle = '#d97706'; // Amber-600
        ctx.lineWidth = 1;
        ctx.strokeRect(-boxW/2, -boxH/2, boxW, boxH);
    } else {
        // 默认黑块
        ctx.fillStyle = '#171717';
        ctx.fillRect(-boxW/2, -boxH/2, boxW, boxH);
        ctx.strokeStyle = '#d97706'; 
        ctx.lineWidth = 1;
        ctx.strokeRect(-boxW/2, -boxH/2, boxW, boxH);
        // 金色笑脸
        ctx.strokeStyle = '#d97706';
        ctx.fillStyle = '#d97706';
        ctx.beginPath(); ctx.arc(-15, -10, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(15, -10, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 10, 12, 0, Math.PI, false); ctx.stroke();
    }
    ctx.restore();

    // 3. 计算相机位置
    const r = baseRadius * distance; 
    const ringX = Math.cos(azRad) * r;
    const ringZ = Math.sin(azRad) * r;
    const sphereRadiusFactor = Math.cos(elRad);
    const heightY = Math.sin(elRad) * r;
    const sphereRingX = Math.cos(azRad) * r * sphereRadiusFactor;
    const sphereRingZ = Math.sin(azRad) * r * sphereRadiusFactor;
    const camX = centerX + sphereRingX;
    const camY = (centerY + 30) + (sphereRingZ * 0.4) - heightY;
    const floorPointX = centerX + sphereRingX;
    const floorPointY = (centerY + 30) + (sphereRingZ * 0.4);

    // 4. 绘制辅助线 (虚线)
    ctx.beginPath();
    ctx.setLineDash([2, 4]); // 更细的虚线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.moveTo(floorPointX, floorPointY);
    ctx.lineTo(camX, camY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 中心连线
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.moveTo(centerX, centerY + 30);
    ctx.lineTo(floorPointX, floorPointY);
    ctx.stroke();

    // 5. 绘制相机点 (高亮金点)
    ctx.beginPath();
    ctx.fillStyle = '#f59e0b'; // Amber-500 Bright
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10; // 仅保留关键点的微光
    ctx.arc(camX, camY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // 视锥 (View Cone) - 白色半透明
    const angleToCenter = Math.atan2(centerY - camY, centerX - camX);
    ctx.save();
    ctx.translate(camX, camY);
    ctx.rotate(angleToCenter);
    ctx.fillStyle = 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)'; // 尝试渐变填充
    // Canvas gradient 比较麻烦，直接用纯色透明
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(50, -20);
    ctx.lineTo(50, 20);
    ctx.fill();
    ctx.restore();

  }, [azimuth, elevation, distance, loadedImage]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={360} 
      className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
    />
  );
}