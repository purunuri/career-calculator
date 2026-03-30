import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Upload, FileText, Image as ImageIcon, Calendar, Trash2, CheckCircle2, XCircle, Calculator, AlertCircle, Loader2, User, RefreshCcw, Clipboard, PlusCircle, Download, FileDigit } from 'lucide-react';

// --- Utility: Public Official Career Calculation (Calendar-based) ---
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const cleanStr = dateStr.toString().trim().replace(/[^\d.~/-]/g, '').replace(/\./g, '-');
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const getDiffYMD = (start, end) => {
  if (!start || !end) return { y: 0, m: 0, d: 0 };
  if (start.getTime() === end.getTime()) return { y: 0, m: 0, d: 0 };

  const s = new Date(start);
  const e = new Date(end);
  e.setDate(e.getDate() + 1);

  let years = e.getFullYear() - s.getFullYear();
  let months = e.getMonth() - s.getMonth();
  let days = e.getDate() - s.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDate = new Date(e.getFullYear(), e.getMonth(), 0).getDate();
    days += prevMonthLastDate;
  }
  
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { y: years, m: months, d: days };
};

const sumPeriods = (periods) => {
  let y = 0, m = 0, d = 0;
  periods.forEach(p => {
    y += p.y; m += p.m; d += p.d;
  });
  m += Math.floor(d / 30);
  d = d % 30;
  y += Math.floor(m / 12);
  m = m % 12;
  return { y, m, d };
};

const subtractPeriods = (p1, p2) => {
  const totalDays1 = p1.y * 360 + p1.m * 30 + p1.d;
  const totalDays2 = p2.y * 360 + p2.m * 30 + p2.d;
  const diffDays = Math.max(0, totalDays1 - totalDays2);
  const y = Math.floor(diffDays / 360);
  const rem = diffDays % 360;
  const m = Math.floor(rem / 30);
  const d = rem % 30;
  return { y, m, d };
};

const formatYMD = (p) => `${p.y}년 ${p.m}월 ${p.d}일`;

// --- Main App ---
export default function App() {
  const [name, setName] = useState("알 수 없음");
  const [careers, setCareers] = useState([]);
  const [refDate, setRefDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const printRef = useRef();

  useEffect(() => {
    const loadScript = (src) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.body.appendChild(script);
    };
    loadScript("https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  }, []);

  const handleAIAnalysis = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 
        const mimeType = file.type || "image/png";
        
        const systemPrompt = "HR data extractor. Extract career history. JSON ONLY. Identify the main subject name, not the 'output person' (출력자).";
        const userQuery = `문서에서 정보를 추출해:
        1. name: 대상자의 성함 (출력자가 아닌, 기록의 주인공 이름)
        2. careers: 배열
           - period: '시작일 ~ 종료일'
           - category: 임용구분
           - rank: 직급
           - dept: 부서
        JSON: {"name": "이름", "careers": [{"period": "...", "category": "...", "rank": "...", "dept": "..."}]}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: userQuery },
                { inlineData: { mimeType: mimeType, data: base64Data } }
              ]
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        const result = await response.json();
        const data = JSON.parse(result.candidates[0].content.parts[0].text);
        
        setName(data.name || "알 수 없음");
        const parsedCareers = (data.careers || []).map((c, idx) => {
          const parts = (c.period || "").split('~');
          const start = parseDate(parts[0]);
          const isOngoing = !parts[1] || !parts[1].trim();
          const end = isOngoing ? parseDate(refDate) : parseDate(parts[1]);
          return {
            id: `ai-${Date.now()}-${idx}`,
            start, end, isOngoing,
            category: c.category || "-",
            rank: c.rank || "-",
            dept: c.dept || "-",
            status: 'select', 
            duration: getDiffYMD(start, end)
          };
        }).filter(c => c.start);
        setCareers(parsedCareers);
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("AI 분석 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }, [refDate]);

  useEffect(() => {
    const handlePaste = (event) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          handleAIAnalysis(items[i].getAsFile());
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleAIAnalysis]);

  const handleExcelUpload = (file) => {
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (!window.XLSX) throw new Error("라이브러리 로딩 중...");
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        
        if (jsonData.length === 0) throw new Error("데이터가 없습니다.");

        let detectedName = "";
        for (let r = 0; r < Math.min(jsonData.length, 15); r++) {
          const row = jsonData[r];
          const rowStr = row.join(" ");
          if (rowStr.includes("출력자")) continue;
          const parenIdx = row.findIndex(c => c && c.toString().includes("("));
          if (parenIdx !== -1) {
            const cellVal = row[parenIdx].toString();
            if (cellVal.trim().startsWith("(") && parenIdx > 0) {
              const leftVal = row[parenIdx - 1]?.toString().trim();
              if (leftVal && leftVal.length >= 2 && leftVal.length <= 5) {
                detectedName = leftVal;
                break;
              }
            } else if (cellVal.includes("(")) {
              const namePart = cellVal.split("(")[0].trim();
              if (namePart.length >= 2 && namePart.length <= 5) {
                detectedName = namePart;
                break;
              }
            }
          }
        }
        if (!detectedName) {
          const b5 = jsonData[4]?.[1]?.toString().trim();
          if (b5 && b5 !== "(" && b5.length >= 2) detectedName = b5;
        }
        setName(detectedName || "알 수 없음");

        const headerRowIndex = jsonData.findIndex(row => row.some(cell => cell.toString().replace(/\s/g, '').includes("기간")));
        if (headerRowIndex === -1) throw new Error("'기간' 항목을 찾을 수 없습니다.");

        const headerRow = jsonData[headerRowIndex];
        const getIdx = (key) => headerRow.findIndex(c => c.toString().replace(/\s/g, '').includes(key));
        const idxPeriod = getIdx("기간");
        const idxCategory = getIdx("임용구분");
        const idxRank = getIdx("직급");
        const idxDept = getIdx("부서");

        const extracted = [];
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const periodStr = row[idxPeriod]?.toString() || "";
          if (!periodStr || !periodStr.includes('~')) continue;
          const parts = periodStr.split('~');
          const start = parseDate(parts[0]);
          const isOngoing = !parts[1] || !parts[1].trim();
          const end = isOngoing ? parseDate(refDate) : parseDate(parts[1]);
          if (start) {
            extracted.push({
              id: `ex-${Date.now()}-${i}`,
              start, end, isOngoing,
              category: row[idxCategory] || "-",
              rank: row[idxRank] || "-",
              dept: row[idxDept] || "-",
              status: 'select',
              duration: getDiffYMD(start, end)
            });
          }
        }
        setCareers(extracted);
      } catch (err) { setError(err.message); }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenericFileUpload = (file) => {
    if (!file) return;
    const fileType = file.name.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'csv'].includes(fileType)) {
      handleExcelUpload(file);
    } else {
      handleAIAnalysis(file);
    }
  };

  const updateStatus = (id, newStatus) => setCareers(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
  const resetAllStatuses = () => setCareers(prev => prev.map(c => ({ ...c, status: 'select' })));
  const fullReset = () => { setName("알 수 없음"); setCareers([]); setError(null); setRefDate(new Date().toISOString().split('T')[0]); };

  const downloadPDF = async () => {
    if (!window.html2canvas || !window.jspdf) return;
    setLoading(true);
    window.scrollTo(0, 0);
    const element = printRef.current;
    try {
      const canvas = await window.html2canvas(element, {
        scale: 3, 
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1200, 
        onclone: (clonedDoc) => {
          // input[type="text"] 처리 (이름 입력칸 등)
          const textInputs = clonedDoc.querySelectorAll('input[type="text"]');
          textInputs.forEach(inp => {
            const span = clonedDoc.createElement('span');
            span.innerText = inp.value;
            span.style.cssText = "font-weight: 900; font-size: 1.125rem; color: #1e293b;";
            inp.parentNode.replaceChild(span, inp);
          });

          const selects = clonedDoc.querySelectorAll('select');
          selects.forEach(sel => {
            const val = sel.options[sel.selectedIndex].text;
            const span = clonedDoc.createElement('span');
            span.innerText = val;
            span.style.cssText = "display: inline-flex; align-items: center; justify-content: center; width: 100%; font-weight: 800; font-size: 10px;";
            if (val.includes('+')) { span.style.color = '#16a34a'; }
            else if (val.includes('-')) { span.style.color = '#e11d48'; }
            sel.parentNode.replaceChild(span, sel);
          });
          
          const dateInputs = clonedDoc.querySelectorAll('input[type="date"]');
          dateInputs.forEach(inp => {
            const span = clonedDoc.createElement('span');
            span.innerText = inp.value;
            span.style.cssText = "font-weight: 900; color: #2563eb; padding: 0 4px;";
            inp.parentNode.replaceChild(span, inp);
          });
          
          const noPrints = clonedDoc.querySelectorAll('.no-print');
          noPrints.forEach(el => el.style.setProperty('display', 'none', 'important'));
        }
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; 
      const contentWidth = pdfWidth - (2 * margin);
      const imgProps = pdf.getImageProperties(imgData);
      const contentHeight = (imgProps.height * contentWidth) / imgProps.width;
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      pdf.save(`경력계산_${name}_${refDate}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const processedCareers = useMemo(() => {
    return careers.map(c => c.isOngoing ? { ...c, end: parseDate(refDate), duration: getDiffYMD(c.start, parseDate(refDate)) } : c);
  }, [careers, refDate]);

  const results = useMemo(() => {
    const included = processedCareers.filter(c => c.status === 'include');
    const excluded = processedCareers.filter(c => c.status === 'exclude');
    let mainCareer = { y: 0, m: 0, d: 0 };
    let firstDate = null;
    if (included.length > 0) {
      firstDate = new Date(Math.min(...included.map(c => c.start.getTime())));
      mainCareer = getDiffYMD(firstDate, parseDate(refDate));
    }
    const totalExcluded = sumPeriods(excluded.map(c => c.duration));
    const actualService = subtractPeriods(mainCareer, totalExcluded);
    return { mainCareer, totalExcluded, actualService, firstDate };
  }, [processedCareers, refDate]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-4">
        
        <div ref={printRef} className="space-y-4 p-5 bg-white rounded-2xl shadow-sm border border-slate-100 min-w-[800px] md:min-w-0">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 text-left">
            <div className="flex-1">
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <Calculator className="text-blue-600 shrink-0" size={28} /> AI 경력 통합 계산기
              </h1>
              <div className="mt-3 flex gap-2 flex-wrap no-print">
                <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 cursor-pointer transition-all">
                  <FileDigit size={16} />
                  <span className="text-xs font-bold">파일 업로드 (엑셀/PDF)</span>
                  <input type="file" className="hidden" accept=".xlsx, .xls, .csv, .pdf" onChange={(e) => handleGenericFileUpload(e.target.files[0])} />
                </label>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm relative group cursor-help hover:border-purple-300">
                  <ImageIcon size={16} className="text-purple-500" />
                  <span className="text-xs font-bold text-slate-700">이미지/클립보드 (Ctrl+V)</span>
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleAIAnalysis(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl shadow-inner border border-slate-200 shrink-0">
              <Calendar className="text-slate-400 w-4 h-4" />
              <span className="text-xs font-bold text-slate-600">기준일:</span>
              <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="border-none focus:ring-0 text-sm font-black text-blue-600 bg-transparent outline-none p-0 w-32" />
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0"><User size={20} /></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">대상자 성함</p>
                {/* 이름 수정 가능하도록 Input으로 변경 */}
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-black w-full border-none focus:ring-0 p-0 bg-transparent outline-none truncate text-slate-800"
                  placeholder="이름 입력"
                />
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">본경력 합계</p>
              <h2 className="text-sm font-bold text-slate-700">{formatYMD(results.mainCareer)}</h2>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
              <p className="text-[10px] font-bold text-rose-400 uppercase mb-1 tracking-tighter">제외경력 합계</p>
              <h2 className="text-sm font-bold text-rose-500">- {formatYMD(results.totalExcluded)}</h2>
            </div>
            <div className="bg-blue-600 p-4 rounded-xl shadow-md text-white flex flex-col justify-center">
              <p className="text-[10px] font-bold text-blue-100 uppercase mb-1 tracking-tight">최종 실제 근속</p>
              <h2 className="text-lg font-black">{formatYMD(results.actualService)}</h2>
            </div>
          </div>

          {!loading && processedCareers.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-left">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap justify-between items-center bg-slate-50 gap-2 no-print">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-blue-500" /> 상세 내역 <span className="text-[10px] text-slate-400 px-2 py-0.5 bg-white rounded-full border border-slate-100 font-bold">총 {processedCareers.length}건</span>
                </h3>
                <div className="flex gap-2">
                  <button onClick={downloadPDF} className="text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"><Download size={14} /> PDF 저장</button>
                  <button onClick={fullReset} className="text-xs font-bold text-blue-600 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-blue-100"><PlusCircle size={14} /> 새자료</button>
                  <button onClick={resetAllStatuses} className="text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"><RefreshCcw size={12} className="inline mr-1" /> 선택 초기화</button>
                </div>
              </div>

              <div className="overflow-x-auto min-w-full">
                <table className="w-full text-left border-collapse table-auto">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">구분</th>
                      <th className="px-5 py-3">기간</th>
                      <th className="px-5 py-3">임용구분</th>
                      <th className="px-5 py-3">직급</th>
                      <th className="px-5 py-3">부서</th>
                      <th className="px-5 py-3 text-right">경력기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {processedCareers.map((c) => {
                      const isNotTransfer = !c.category.includes("전보");
                      const rowOpacity = c.status === 'exclude' ? 'opacity-60 grayscale' : '';
                      
                      return (
                        <tr key={c.id} className={`transition-all hover:bg-slate-50/30 ${rowOpacity}`}>
                          <td className="px-5 py-3 min-w-[90px]">
                            <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)}
                              className={`text-[11px] font-black px-2 py-1.5 rounded-md border outline-none cursor-pointer w-full text-center transition-colors ${
                                c.status === 'include' ? 'bg-green-50 text-green-600 border-green-200' :
                                c.status === 'exclude' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-500 border-slate-200'
                              }`}
                            >
                              <option value="select">선택</option>
                              <option value="include">포함 (+)</option>
                              <option value="exclude">제외 (-)</option>
                            </select>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap font-bold text-slate-700 text-xs">
                            {c.start.toLocaleDateString()} ~ {c.end.toLocaleDateString()}
                            {c.isOngoing && <span className="ml-1.5 text-[9px] text-blue-500 bg-blue-50 px-1 rounded-sm font-black">진행중</span>}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md border inline-block whitespace-nowrap ${
                              isNotTransfer 
                                ? (c.status === 'exclude' ? 'bg-yellow-100 border-yellow-200 text-yellow-700' : 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-sm')
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}>
                              {c.category}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[10px] text-slate-600 font-medium whitespace-nowrap">{c.rank}</td>
                          <td className="px-5 py-3 text-left">
                            <div className="text-[10px] text-slate-400 break-words leading-tight max-w-[150px]" title={c.dept}>{c.dept}</div>
                          </td>
                          <td className="px-5 py-3 text-right font-black text-slate-800 text-xs whitespace-nowrap">{formatYMD(c.duration)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white p-4">
            <Loader2 className="animate-spin mb-4" size={48} />
            <p className="font-black text-xl text-center">분석 중이야... 잠시만 기다려!</p>
          </div>
        )}
        
        {!loading && processedCareers.length === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-32 flex flex-col items-center justify-center text-slate-300 shadow-sm">
            <Clipboard size={48} className="opacity-10 text-blue-600 mb-6" />
            <p className="text-base font-black text-slate-400 text-center leading-relaxed">
              파일(엑셀/PDF)을 올리거나 <kbd className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-500 text-xs font-bold">Ctrl+V</kbd> 해봐!<br />
              <span className="text-xs font-normal text-slate-300 mt-2 block italic">불러온 이름이 틀리면 직접 수정할 수 있어.</span>
            </p>
          </div>
        )}

        {error && <div className="bg-rose-50 border border-rose-100 text-rose-500 p-4 rounded-xl flex items-center gap-3 text-sm font-bold shadow-sm animate-in fade-in"><AlertCircle size={18} /> {error}</div>}
      </div>
    </div>
  );
}