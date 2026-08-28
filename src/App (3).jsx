import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Search, Eye, EyeOff, Hammer, Package, Building2, X, Check, Undo2, Scissors, BadgeCheck, Trash2, ChevronDown, FlaskConical, Printer, ScanLine, AlertCircle, FileText, Copy, ListChecks, LayoutGrid, List, Camera, ClipboardCheck, ShieldAlert, Truck, CalendarClock, PackageCheck, Wrench } from "lucide-react";

const STORAGE_KEY = "slab-inventory-data";
const JSBARCODE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js";
const QRCODE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
const MAX_DOC_BYTES = 3.5 * 1024 * 1024;

const generateBarcode = () => "SL" + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();

function loadJsBarcode() {
  return new Promise((resolve, reject) => {
    if (window.JsBarcode) return resolve(window.JsBarcode);
    const existing = document.getElementById("jsbarcode-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.JsBarcode));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "jsbarcode-script";
    script.src = JSBARCODE_SRC;
    script.onload = () => resolve(window.JsBarcode);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function loadQRCodeLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve(window.QRCode);
    const existing = document.getElementById("qrcode-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.QRCode));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "qrcode-script";
    script.src = QRCODE_SRC;
    script.onload = () => resolve(window.QRCode);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

const STATUS = {
  STOCK: "in-stock",
  RESERVED: "reserved",
  CUT: "cut",
};

const STATUS_LABEL = {
  [STATUS.STOCK]: "In Stock",
  [STATUS.RESERVED]: "Reserved",
  [STATUS.CUT]: "Cut & Used",
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const WHOLESALE_MARGIN = 0.26;
const RETAIL_MARGIN = 0.40;

const sqftOf = (l, w) => {
  const L = parseFloat(l), W = parseFloat(w);
  if (!L || !W) return 0;
  return (L * W) / 144;
};

// ---- remnant shapes: freeform polygon area + edge lengths, all in inches ----
const distanceIn = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

const polygonAreaIn2 = (points) => {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
};

const remnantSqft = (shape) => (shape && shape.points && shape.points.length >= 3 ? polygonAreaIn2(shape.points) / 144 : 0);

const getSqft = (s) => (s.kind === "remnant" ? remnantSqft(s.shape) : sqftOf(s.lengthIn, s.widthIn));

const defaultShape = () => ({ maxWidth: 96, maxHeight: 72, gridSize: 6, points: [] });

function ShapeSVG({ shape, interactive, onCanvasClick, onEdgeLengthChange, height = 260 }) {
  const svgRef = useRef(null);
  const [editingEdge, setEditingEdge] = useState(null);
  const { maxWidth, maxHeight, gridSize, points } = shape;
  const cols = Math.max(1, Math.round(maxWidth / gridSize));
  const rows = Math.max(1, Math.round(maxHeight / gridSize));
  const gridLines = [];
  for (let i = 0; i <= cols; i++) gridLines.push(<line key={`v${i}`} x1={i * gridSize} y1={0} x2={i * gridSize} y2={maxHeight} stroke="#d3d2c6" strokeWidth={maxWidth / 500} />);
  for (let j = 0; j <= rows; j++) gridLines.push(<line key={`h${j}`} x1={0} y1={j * gridSize} x2={maxWidth} y2={j * gridSize} stroke="#d3d2c6" strokeWidth={maxWidth / 500} />);

  const closed = points.length >= 3;
  const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(" ");
  const edgeList = [];
  if (points.length >= 2) {
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      edgeList.push({ i, a, b, len: distanceIn(a, b), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
  }

  const editable = !!onEdgeLengthChange;
  const openEdgeEditor = (edge, e) => {
    if (!editable) return;
    if (e) e.stopPropagation();
    setEditingEdge({ index: edge.i, value: edge.len.toFixed(1) });
  };
  const commitEdgeEdit = () => {
    if (!editingEdge) return;
    const newLen = parseFloat(editingEdge.value);
    if (newLen > 0 && onEdgeLengthChange) onEdgeLengthChange(editingEdge.index, newLen);
    setEditingEdge(null);
  };

  const handleClick = (e) => {
    if (!interactive || !onCanvasClick || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * maxWidth;
    const y = ((e.clientY - rect.top) / rect.height) * maxHeight;
    const snapX = Math.min(maxWidth, Math.max(0, Math.round(x / gridSize) * gridSize));
    const snapY = Math.min(maxHeight, Math.max(0, Math.round(y / gridSize) * gridSize));
    onCanvasClick({ x: snapX, y: snapY });
  };

  const editingEdgeInfo = editingEdge ? edgeList.find((edg) => edg.i === editingEdge.index) : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${maxWidth} ${maxHeight}`}
        width="100%"
        height={height}
        style={{ background: "white", borderRadius: 8, border: "1.5px solid #d3d2c6", cursor: interactive ? "crosshair" : "default", display: "block" }}
        onClick={handleClick}
      >
        {gridLines}
        {points.length >= 3 && <polygon points={pointsAttr} fill="rgba(184,145,47,0.18)" stroke="#b8912f" strokeWidth={maxWidth / 260} />}
        {points.length === 2 && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#b8912f" strokeWidth={maxWidth / 260} />}
        {editable && edgeList.map((edg) => (
          <line key={`hit${edg.i}`} x1={edg.a.x} y1={edg.a.y} x2={edg.b.x} y2={edg.b.y} stroke="transparent" strokeWidth={maxWidth / 30} onClick={(e) => openEdgeEditor(edg, e)} style={{ cursor: "text" }} />
        ))}
        {edgeList.map((edg) => (
          <text
            key={`e${edg.i}`}
            x={edg.mx}
            y={edg.my}
            fontSize={maxWidth / 40}
            fill={editable ? "#b8912f" : "#1c2321"}
            stroke="white"
            strokeWidth={maxWidth / 140}
            paintOrder="stroke"
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight={editable ? 700 : 400}
            onClick={(e) => openEdgeEditor(edg, e)}
            style={{ cursor: editable ? "text" : "default" }}
          >
            {edg.len.toFixed(1)}"
          </text>
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={maxWidth / 110} fill="#1c2321" />
        ))}
      </svg>
      {editingEdgeInfo && (
        <div className="edge-edit-popover" style={{ left: `${(editingEdgeInfo.mx / maxWidth) * 100}%`, top: `${(editingEdgeInfo.my / maxHeight) * 100}%` }}>
          <input
            autoFocus
            type="number"
            value={editingEdge.value}
            onChange={(e) => setEditingEdge({ ...editingEdge, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdgeEdit();
              if (e.key === "Escape") setEditingEdge(null);
            }}
            onBlur={commitEdgeEdit}
          />
          <span>in</span>
        </div>
      )}
    </div>
  );
}

const money = (n) => {
  const v = parseFloat(n);
  if (isNaN(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

// A fee can be a flat total $, a % of base cost, or a $ rate per square foot of this slab.
const computeFee = (baseCost, type, value, sqft) => {
  const b = parseFloat(baseCost) || 0;
  const v = parseFloat(value) || 0;
  if (!v) return 0;
  if (type === "percent") return b * (v / 100);
  if (type === "persqft") return v * (sqft || 0);
  return v; // flat total $
};

const computeTotalCost = (s) => {
  const base = parseFloat(s.baseCost) || 0;
  const sqft = getSqft(s);
  return base + computeFee(s.baseCost, s.feeType, s.feeValue, sqft) + computeFee(s.baseCost, s.surchargeType, s.surchargeValue, sqft);
};

// Cost broken out per square foot, since delivery fees and surcharges should scale with how much
// material a slab actually accounts for rather than being a flat add-on regardless of size.
const getCostPerSqft = (s) => {
  const sqft = getSqft(s);
  if (!sqft) return { base: 0, delivery: 0, surcharge: 0, total: 0 };
  const base = (parseFloat(s.baseCost) || 0) / sqft;
  const delivery = computeFee(s.baseCost, s.feeType, s.feeValue, sqft) / sqft;
  const surcharge = computeFee(s.baseCost, s.surchargeType, s.surchargeValue, sqft) / sqft;
  return { base, delivery, surcharge, total: base + delivery + surcharge };
};

// Margin-based pricing: price = cost / (1 - margin%), so the margin is a share of the selling price, not a markup on cost.
const marginPrice = (totalCost, margin) => (totalCost > 0 ? totalCost / (1 - margin) : 0);

const getPricing = (s) => {
  const totalCost = computeTotalCost(s);
  const wholesaleCalc = marginPrice(totalCost, WHOLESALE_MARGIN);
  const retailCalc = marginPrice(totalCost, RETAIL_MARGIN);
  const wholesale = s.useManualWholesale && s.wholesaleManual ? parseFloat(s.wholesaleManual) || 0 : wholesaleCalc;
  const retail = s.useManualRetail && s.retailManual ? parseFloat(s.retailManual) || 0 : retailCalc;
  return { totalCost, wholesaleCalc, retailCalc, wholesale, retail };
};

const MATERIAL_TYPES = ["Granite", "Quartz", "Quartzite", "Marble", "Porcelain", "Dolomite", "Soapstone", "Onyx", "Travertine", "Limestone", "Other"];

const emptyForm = {
  kind: "slab",
  materialName: "",
  materialType: "",
  color: "",
  lengthIn: "",
  widthIn: "",
  shape: null,
  thickness: "3cm",
  lotNumber: "",
  vendor: "",
  dateReceived: new Date().toISOString().slice(0, 10),
  baseCost: "",
  feeType: "flat",
  feeValue: "",
  surchargeType: "flat",
  surchargeValue: "",
  wholesaleManual: "",
  retailManual: "",
  useManualWholesale: false,
  useManualRetail: false,
  owner: "Shop",
  photoLink: "",
  salesOrderNumber: "",
  invoiceNumber: "",
  notes: "",
};

const emptyOrderForm = () => ({
  materialName: "",
  materialType: "",
  color: "",
  vendor: "",
  thickness: "3cm",
  quantity: "1",
  lengthIn: "",
  widthIn: "",
  owner: "Shop",
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDate: "",
  lotNumber: "",
  jobName: "",
  salesOrderNumber: "",
  notes: "",
});

// today's date as YYYY-MM-DD, for comparing against hold-expiration / order-expected dates
const todayStr = () => new Date().toISOString().slice(0, 10);

const daysBetween = (fromStr, toStr) => {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
};

export default function SlabInventoryApp({ currentUser, onSignOut } = {}) {
  const [loaded, setLoaded] = useState(false);
  const [slabs, setSlabs] = useState([]);
  const [builders, setBuilders] = useState([]);
  const [vendors, setVendors] = useState(["MSI", "Arizona Tile", "Daltile"]);
  const [orders, setOrders] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [showCosts, setShowCosts] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [remnantOnly, setRemnantOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showCostFields, setShowCostFields] = useState(false);
  const [detailSlab, setDetailSlab] = useState(null);
  const [reserveTarget, setReserveTarget] = useState(null);
  const [reserveJob, setReserveJob] = useState("");
  const [reserveOwner, setReserveOwner] = useState("Shop");
  const [addBuilderOpen, setAddBuilderOpen] = useState(false);
  const [newBuilderName, setNewBuilderName] = useState("");
  const [confirmDeleteBuilder, setConfirmDeleteBuilder] = useState(null);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [addSalesRepOpen, setAddSalesRepOpen] = useState(false);
  const [newSalesRepName, setNewSalesRepName] = useState("");
  const [reserveSalesRep, setReserveSalesRep] = useState("");
  const [formId, setFormId] = useState(null);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState(null);
  const [detailPhotoLoading, setDetailPhotoLoading] = useState(false);
  const [shapeModalOpen, setShapeModalOpen] = useState(false);
  const [shapeDraft, setShapeDraft] = useState(null);
  const [docModalSlab, setDocModalSlab] = useState(null);
  const [docType, setDocType] = useState("invoice");
  const [docRefNumber, setDocRefNumber] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");
  const [docViewingId, setDocViewingId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDefaults, setBulkDefaults] = useState({ vendor: "", lotNumber: "", owner: "Shop", thickness: "3cm", color: "", materialType: "", dateReceived: new Date().toISOString().slice(0, 10) });
  const [bulkRows, setBulkRows] = useState([]);
  const [printListOpen, setPrintListOpen] = useState(false);
  const [printIncludeWholesale, setPrintIncludeWholesale] = useState(true);
  const [printIncludeCost, setPrintIncludeCost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [labelSlab, setLabelSlab] = useState(null);
  const [barcodeError, setBarcodeError] = useState(false);
  const [labelQueue, setLabelQueue] = useState(null);
  const labelQueueCanvases = useRef(new Map());
  const [holdLabelSlab, setHoldLabelSlab] = useState(null);
  const holdBarcodeCanvasRef = useRef(null);
  const holdQrCodeRef = useRef(null);
  const [scanValue, setScanValue] = useState("");
  const [scanError, setScanError] = useState(false);
  const [scanResultSlab, setScanResultSlab] = useState(null);
  const barcodeCanvasRef = useRef(null);
  const qrCodeRef = useRef(null);
  const labelQueueQRs = useRef(new Map());
  const scanInputRef = useRef(null);
  const [viewMode, setViewMode] = useState("list");
  const [notScannedOnly, setNotScannedOnly] = useState(false);
  const [baseCostMode, setBaseCostMode] = useState("total");
  const [baseCostRate, setBaseCostRate] = useState("");
  const [reserveCustomer, setReserveCustomer] = useState("");
  const [reserveJobNumber, setReserveJobNumber] = useState("");
  const [reserveHoldExpires, setReserveHoldExpires] = useState("");
  const [expiredHoldsOnly, setExpiredHoldsOnly] = useState(false);
  const [pulledForFabOnly, setPulledForFabOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [colorFilter, setColorFilter] = useState("");
  const [materialNameFilter, setMaterialNameFilter] = useState("");
  const [materialTypeFilterInv, setMaterialTypeFilterInv] = useState("");
  const [vendorFilterInv, setVendorFilterInv] = useState("");
  const [thicknessFilterInv, setThicknessFilterInv] = useState("");
  const [minSqftFilter, setMinSqftFilter] = useState("");
  const [orderFiltersOpen, setOrderFiltersOpen] = useState(false);
  const [orderColorFilter, setOrderColorFilter] = useState("");
  const [orderMaterialTypeFilter, setOrderMaterialTypeFilter] = useState("");
  const [orderVendorFilter, setOrderVendorFilter] = useState("");
  const [orderThicknessFilter, setOrderThicknessFilter] = useState("");
  const [auditActive, setAuditActive] = useState(false);
  const [auditScope, setAuditScope] = useState([]);
  const [auditScannedIds, setAuditScannedIds] = useState(new Set());
  const [auditFlash, setAuditFlash] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraIntervalRef = useRef(null);
  const lastScanRef = useRef({ code: "", time: 0 });
  const [page, setPage] = useState("inventory");
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderForm, setOrderForm] = useState(emptyOrderForm());
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ordered");
  const [receivingOrderId, setReceivingOrderId] = useState(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(null);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          const loadedSlabs = (parsed.slabs || []).map((s) => {
            let next = s.barcode ? s : { ...s, barcode: generateBarcode() };
            if (!next.kind) next = { ...next, kind: "slab" };
            // migrate slabs saved before cost breakdown + margin pricing existed
            if (next.baseCost === undefined) {
              next = {
                ...next,
                kind: next.kind || "slab",
                baseCost: next.cost || "",
                feeType: "flat",
                feeValue: "",
                surchargeType: "flat",
                surchargeValue: "",
                useManualWholesale: false,
                wholesaleManual: "",
                useManualRetail: !!next.salePrice,
                retailManual: next.salePrice || "",
                photoLink: next.photoLink || "",
              };
            }
            return next;
          });
          setSlabs(loadedSlabs);
          setBuilders(parsed.builders || []);
          setVendors(parsed.vendors && parsed.vendors.length ? parsed.vendors : ["MSI", "Arizona Tile", "Daltile"]);
          setOrders(parsed.orders || []);
          setSalesReps(parsed.salesReps || []);
        }
      } catch (e) {
        // no existing data yet, start fresh
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---- save ----
  const persist = useCallback(async (nextSlabs, nextBuilders, nextVendors, nextOrders, nextSalesReps) => {
    try {
      const result = await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ slabs: nextSlabs, builders: nextBuilders, vendors: nextVendors, orders: nextOrders, salesReps: nextSalesReps }),
        true
      );
      if (!result) setSaveError(true);
      else setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) persist(slabs, builders, vendors, orders, salesReps);
  }, [slabs, builders, vendors, orders, salesReps, loaded, persist]);

  // ---- derived ----
  const owners = useMemo(() => ["Shop", ...builders], [builders]);

  const counts = useMemo(() => {
    const c = { all: slabs.length };
    owners.forEach((o) => (c[o] = slabs.filter((s) => s.owner === o).length));
    return c;
  }, [slabs, owners]);

  const filtered = useMemo(() => {
    return slabs.filter((s) => {
      if (activeTab !== "all" && s.owner !== activeTab) return false;
      if (statusFilter === "active" && s.status === STATUS.CUT) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && s.status !== statusFilter) return false;
      if (remnantOnly && s.kind !== "remnant") return false;
      if (notScannedOnly && !s.flaggedMissing) return false;
      if (expiredHoldsOnly) {
        const hi = s.status === STATUS.RESERVED && s.holdExpires ? daysBetween(todayStr(), s.holdExpires) < 0 : false;
        if (!hi) return false;
      }
      if (colorFilter && s.color !== colorFilter) return false;
      if (materialNameFilter && s.materialName !== materialNameFilter) return false;
      if (materialTypeFilterInv && s.materialType !== materialTypeFilterInv) return false;
      if (vendorFilterInv && s.vendor !== vendorFilterInv) return false;
      if (thicknessFilterInv && s.thickness !== thicknessFilterInv) return false;
      if (minSqftFilter && getSqft(s) < parseFloat(minSqftFilter)) return false;
      if (pulledForFabOnly && !s.pulledForFab) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${s.materialName} ${s.materialType || ""} ${s.color || ""} ${s.lotNumber} ${s.vendor} ${s.jobName || ""} ${s.customerName || ""} ${s.jobNumber || ""} ${s.salesOrderNumber || ""} ${s.invoiceNumber || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.dateReceived || "").localeCompare(a.dateReceived || ""));
  }, [slabs, activeTab, statusFilter, remnantOnly, notScannedOnly, expiredHoldsOnly, colorFilter, materialNameFilter, materialTypeFilterInv, vendorFilterInv, thicknessFilterInv, minSqftFilter, pulledForFabOnly, search]);

  // ---- form handlers ----
  const openAdd = () => {
    setForm(emptyForm);
    setFormId(uid());
    setPhotoDataUrl(null);
    setPhotoRemoved(false);
    setShowCostFields(false);
    setBaseCostMode("total");
    setBaseCostRate("");
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (slab) => {
    setForm({
      materialName: slab.materialName,
      materialType: slab.materialType || "",
      color: slab.color || "",
      lengthIn: slab.lengthIn,
      widthIn: slab.widthIn,
      kind: slab.kind || "slab",
      shape: slab.shape || null,
      thickness: slab.thickness,
      lotNumber: slab.lotNumber,
      vendor: slab.vendor,
      dateReceived: slab.dateReceived,
      baseCost: slab.baseCost || "",
      feeType: slab.feeType || "flat",
      feeValue: slab.feeValue || "",
      surchargeType: slab.surchargeType || "flat",
      surchargeValue: slab.surchargeValue || "",
      wholesaleManual: slab.wholesaleManual || "",
      retailManual: slab.retailManual || "",
      useManualWholesale: !!slab.useManualWholesale,
      useManualRetail: !!slab.useManualRetail,
      owner: slab.owner,
      photoLink: slab.photoLink || "",
      salesOrderNumber: slab.salesOrderNumber || "",
      invoiceNumber: slab.invoiceNumber || "",
      notes: slab.notes || "",
    });
    setFormId(slab.id);
    setPhotoDataUrl(null);
    setPhotoRemoved(false);
    if (slab.hasPhoto) {
      window.storage.get(`photo:${slab.id}`, true).then((res) => {
        if (res && res.value) setPhotoDataUrl(res.value);
      }).catch(() => {});
    }
    setShowCostFields(!!slab.baseCost);
    setBaseCostMode("total");
    setBaseCostRate("");
    setEditingId(slab.id);
    setDetailSlab(null);
    setFormOpen(true);
  };

  const currentSqft = form.kind === "remnant" ? remnantSqft(form.shape) : sqftOf(form.lengthIn, form.widthIn);
  const formPricing = getPricing(form);
  const formCostPerSqft = getCostPerSqft(form);

  const setBaseCostModeTo = (mode) => {
    if (mode === "persqft") {
      const rate = currentSqft > 0 && form.baseCost ? (parseFloat(form.baseCost) / currentSqft).toFixed(2) : "";
      setBaseCostRate(rate);
    }
    setBaseCostMode(mode);
  };

  const handleBaseCostRateChange = (val) => {
    setBaseCostRate(val);
    const total = currentSqft > 0 ? (parseFloat(val) || 0) * currentSqft : 0;
    setForm((f) => ({ ...f, baseCost: total ? total.toFixed(2) : "" }));
  };

  const openShapeEditor = () => {
    setShapeDraft(form.shape ? { ...form.shape, points: [...form.shape.points] } : defaultShape());
    setShapeModalOpen(true);
  };
  const addShapePoint = (pt) => setShapeDraft((d) => ({ ...d, points: [...d.points, pt] }));
  const undoShapePoint = () => setShapeDraft((d) => ({ ...d, points: d.points.slice(0, -1) }));
  const clearShapePoints = () => setShapeDraft((d) => ({ ...d, points: [] }));
  const updateEdgeLength = (index, newLength) => {
    setShapeDraft((d) => {
      const pts = d.points;
      const n = pts.length;
      const a = pts[index];
      const bIndex = (index + 1) % n;
      const b = pts[bIndex];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const rawX = a.x + newLength * Math.cos(angle);
      const rawY = a.y + newLength * Math.sin(angle);
      const pad = 12;
      const newMaxWidth = Math.max(d.maxWidth, Math.ceil(rawX) + pad);
      const newMaxHeight = Math.max(d.maxHeight, Math.ceil(rawY) + pad);
      const newPoints = [...pts];
      newPoints[bIndex] = { x: Math.round(Math.max(0, rawX) * 10) / 10, y: Math.round(Math.max(0, rawY) * 10) / 10 };
      return { ...d, points: newPoints, maxWidth: newMaxWidth, maxHeight: newMaxHeight };
    });
  };
  const saveShape = () => {
    if (!shapeDraft || shapeDraft.points.length < 3) return;
    setForm((f) => ({ ...f, shape: shapeDraft }));
    setShapeModalOpen(false);
  };

  const handlePhotoFile = (file) => {
    if (!file) return;
    setPhotoUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 640;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.72));
        setPhotoRemoved(false);
        setPhotoUploading(false);
      };
      img.onerror = () => setPhotoUploading(false);
      img.src = ev.target.result;
    };
    reader.onerror = () => setPhotoUploading(false);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoDataUrl(null);
    setPhotoRemoved(true);
  };

  const saveSlab = (options = {}) => {
    if (!form.materialName.trim()) return;
    const id = editingId || formId;
    if (photoDataUrl) {
      window.storage.set(`photo:${id}`, photoDataUrl, true).catch(() => {});
    } else if (photoRemoved) {
      window.storage.delete(`photo:${id}`, true).catch(() => {});
    }
    const hasPhoto = photoDataUrl ? true : photoRemoved ? false : undefined;
    let resultSlab = null;
    if (editingId) {
      setSlabs((prev) => prev.map((s) => {
        if (s.id !== editingId) return s;
        const updated = { ...s, ...form, hasPhoto: hasPhoto === undefined ? s.hasPhoto : hasPhoto };
        resultSlab = updated;
        return updated;
      }));
    } else {
      const newSlab = {
        id,
        barcode: generateBarcode(),
        ...form,
        hasPhoto: !!hasPhoto,
        status: STATUS.STOCK,
        jobName: "",
        documents: [],
        history: [{ event: "Received", date: form.dateReceived }],
      };
      resultSlab = newSlab;
      setSlabs((prev) => [newSlab, ...prev]);
    }
    setFormOpen(false);
    if (options.print && resultSlab) setLabelSlab(resultSlab);
  };

  const deleteSlab = (id) => {
    const slab = slabs.find((x) => x.id === id);
    setSlabs((prev) => prev.filter((s) => s.id !== id));
    window.storage.delete(`photo:${id}`, true).catch(() => {});
    (slab?.documents || []).forEach((d) => window.storage.delete(`doc:${id}:${d.id}`, true).catch(() => {}));
    setConfirmDelete(null);
    setDetailSlab(null);
  };

  const openDocModal = (slab) => {
    setDocType("invoice");
    setDocRefNumber("");
    setDocFile(null);
    setDocError("");
    setDocModalSlab(slab);
  };

  const handleDocFile = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setDocError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setDocError("That file is too large (limit ~3.5MB). Try a compressed or scanned-lower-res PDF.");
      return;
    }
    setDocError("");
    setDocUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDocFile({ fileName: file.name, dataUrl: ev.target.result });
      setDocUploading(false);
    };
    reader.onerror = () => {
      setDocUploading(false);
      setDocError("Couldn't read that file — try again.");
    };
    reader.readAsDataURL(file);
  };

  const saveDocument = async () => {
    if (!docFile || !docModalSlab) return;
    const docId = uid();
    try {
      const result = await window.storage.set(`doc:${docModalSlab.id}:${docId}`, docFile.dataUrl, true);
      if (!result) {
        setDocError("Couldn't save that file — try again.");
        return;
      }
    } catch (e) {
      setDocError("Couldn't save that file — try again.");
      return;
    }
    const newDoc = { id: docId, docType, refNumber: docRefNumber.trim(), fileName: docFile.fileName, date: new Date().toISOString().slice(0, 10) };
    setSlabs((prev) => prev.map((s) => (s.id === docModalSlab.id ? { ...s, documents: [...(s.documents || []), newDoc] } : s)));
    setDocModalSlab(null);
  };

  const viewDocument = async (slabId, docId) => {
    setDocViewingId(docId);
    try {
      const res = await window.storage.get(`doc:${slabId}:${docId}`, true);
      if (res && res.value) window.open(res.value, "_blank");
    } catch (e) {
      // ignore
    }
    setDocViewingId(null);
  };

  const deleteDocument = (slabId, docId) => {
    window.storage.delete(`doc:${slabId}:${docId}`, true).catch(() => {});
    setSlabs((prev) => prev.map((s) => (s.id === slabId ? { ...s, documents: (s.documents || []).filter((d) => d.id !== docId) } : s)));
  };

  // ---- duplicate ----
  const duplicateSlab = async (slab) => {
    const newId = uid();
    const cloned = {
      ...slab,
      id: newId,
      barcode: generateBarcode(),
      status: STATUS.STOCK,
      jobName: "",
      documents: [],
      history: [{ event: `Duplicated from ${slab.materialName}`, date: new Date().toISOString().slice(0, 10) }],
    };
    setSlabs((prev) => [cloned, ...prev]);
    setDetailSlab(cloned);
    if (slab.hasPhoto) {
      try {
        const res = await window.storage.get(`photo:${slab.id}`, true);
        if (res && res.value) await window.storage.set(`photo:${newId}`, res.value, true);
      } catch (e) {
        // ignore, duplicate still succeeds without photo
      }
    }
  };

  // ---- fast add (bulk) ----
  const emptyBulkRow = (defaults) => ({
    rowId: uid(),
    materialName: "",
    materialType: defaults.materialType || "",
    color: defaults.color || "",
    lengthIn: defaults.lengthIn || "",
    widthIn: defaults.widthIn || "",
    thickness: defaults.thickness,
    lotNumber: defaults.lotNumber,
    vendor: defaults.vendor,
    owner: defaults.owner,
  });

  const openBulkAdd = () => {
    const defaults = { vendor: "", lotNumber: "", owner: "Shop", thickness: "3cm", color: "", materialType: "", dateReceived: new Date().toISOString().slice(0, 10) };
    setBulkDefaults(defaults);
    setBulkRows(Array.from({ length: 5 }, () => emptyBulkRow(defaults)));
    setReceivingOrderId(null);
    setBulkOpen(true);
  };

  const closeBulkAdd = () => {
    setReceivingOrderId(null);
    setBulkOpen(false);
  };

  const addBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow(bulkDefaults)]);
  const removeBulkRow = (rowId) => setBulkRows((prev) => prev.filter((r) => r.rowId !== rowId));
  const updateBulkRow = (rowId, key, value) => setBulkRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, [key]: value } : r)));
  const applyBulkDefaultsToRows = () => {
    setBulkRows((prev) => prev.map((r) => ({ ...r, thickness: bulkDefaults.thickness, lotNumber: bulkDefaults.lotNumber, vendor: bulkDefaults.vendor, owner: bulkDefaults.owner, color: bulkDefaults.color, materialType: bulkDefaults.materialType })));
  };

  const bulkValidCount = bulkRows.filter((r) => r.materialName.trim()).length;

  const saveBulkRows = (options = {}) => {
    const validRows = bulkRows.filter((r) => r.materialName.trim());
    if (!validRows.length) {
      setReceivingOrderId(null);
      setBulkOpen(false);
      return;
    }
    const sourceOrder = receivingOrderId ? orders.find((o) => o.id === receivingOrderId) : null;
    const orderJobName = sourceOrder && sourceOrder.jobName ? sourceOrder.jobName.trim() : "";
    const orderSalesOrderNumber = sourceOrder && sourceOrder.salesOrderNumber ? sourceOrder.salesOrderNumber.trim() : "";
    const newSlabs = validRows.map((r) => ({
      id: uid(),
      barcode: generateBarcode(),
      kind: "slab",
      materialName: r.materialName.trim(),
      materialType: r.materialType || "",
      color: r.color || "",
      lengthIn: r.lengthIn,
      widthIn: r.widthIn,
      shape: null,
      thickness: r.thickness,
      lotNumber: r.lotNumber,
      vendor: r.vendor,
      dateReceived: bulkDefaults.dateReceived,
      baseCost: "",
      feeType: "flat",
      feeValue: "",
      surchargeType: "flat",
      surchargeValue: "",
      wholesaleManual: "",
      retailManual: "",
      useManualWholesale: false,
      useManualRetail: false,
      owner: r.owner,
      photoLink: "",
      notes: "",
      hasPhoto: false,
      documents: [],
      status: orderJobName ? STATUS.RESERVED : STATUS.STOCK,
      jobName: orderJobName,
      customerName: "",
      jobNumber: "",
      salesOrderNumber: orderSalesOrderNumber,
      invoiceNumber: "",
      history: [{ event: orderJobName ? `Received and reserved for ${orderJobName}` : "Received", date: bulkDefaults.dateReceived }],
    }));
    setSlabs((prev) => [...newSlabs, ...prev]);
    setBulkOpen(false);
    if (receivingOrderId) {
      const orderIdToReceive = receivingOrderId;
      setOrders((prev) => prev.map((o) => (o.id === orderIdToReceive ? { ...o, status: "received", receivedDate: todayStr(), receivedSlabIds: newSlabs.map((s) => s.id) } : o)));
      setReceivingOrderId(null);
    }
    if (options.print) setLabelQueue(newSlabs);
  };

  const openReserve = (slab) => {
    setReserveTarget(slab);
    setReserveJob(slab.jobName || "");
    setReserveCustomer(slab.customerName || "");
    setReserveJobNumber(slab.jobNumber || "");
    setReserveHoldExpires(slab.holdExpires || "");
    setReserveSalesRep(slab.salesRep || "");
    setReserveOwner(slab.owner || "Shop");
  };

  const confirmReserve = () => {
    if (!reserveJob.trim() && !reserveCustomer.trim() && !reserveJobNumber.trim()) return;
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === reserveTarget.id
          ? {
              ...s,
              status: STATUS.RESERVED,
              jobName: reserveJob.trim(),
              customerName: reserveCustomer.trim(),
              jobNumber: reserveJobNumber.trim(),
              holdExpires: reserveHoldExpires,
              salesRep: reserveSalesRep,
              owner: reserveOwner,
              history: [...(s.history || []), { event: `Reserved${reserveJob.trim() ? ` for ${reserveJob.trim()}` : ""}${reserveCustomer.trim() ? ` — ${reserveCustomer.trim()}` : ""}${reserveHoldExpires ? ` (hold expires ${reserveHoldExpires})` : ""}${reserveSalesRep ? ` · rep: ${reserveSalesRep}` : ""}${actorTag()}`, date: new Date().toISOString().slice(0, 10) }],
            }
          : s
      )
    );
    setReserveTarget(null);
    setDetailSlab(null);
  };

  // Small helper so history entries can note who performed an action, when signed in.
  const actorTag = () => (currentUser ? ` (by ${currentUser})` : "");

  const holdInfo = (s) => {
    if (s.status !== STATUS.RESERVED || !s.holdExpires) return null;
    const days = daysBetween(todayStr(), s.holdExpires);
    return { expired: days < 0, daysLeft: days };
  };

  // Auto-release: any reserved slab whose hold expiration date has passed goes back
  // to available stock automatically, clearing the reservation-specific fields.
  // Checked once on load and hourly after that, so it also catches a hold expiring
  // while the app is left open.
  useEffect(() => {
    if (!loaded) return;
    const releaseExpiredHolds = () => {
      const today = todayStr();
      setSlabs((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          if (s.status === STATUS.RESERVED && s.holdExpires && s.holdExpires < today) {
            changed = true;
            return {
              ...s,
              status: STATUS.STOCK,
              jobName: "",
              customerName: "",
              jobNumber: "",
              holdExpires: "",
              salesRep: "",
              history: [...(s.history || []), { event: "Hold expired — automatically released", date: today }],
            };
          }
          return s;
        });
        return changed ? next : prev;
      });
    };
    releaseExpiredHolds();
    const interval = setInterval(releaseExpiredHolds, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loaded]);

  const markCut = (slab) => {
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === slab.id
          ? {
              ...s,
              status: STATUS.CUT,
              pulledForFab: false,
              pulledDate: "",
              pulledBy: "",
              history: [...(s.history || []), { event: (s.jobName ? `Cut for ${s.jobName}` : "Marked cut & used") + actorTag(), date: new Date().toISOString().slice(0, 10) }],
            }
          : s
      )
    );
    setDetailSlab(null);
  };

  const returnToStock = (slab) => {
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === slab.id
          ? {
              ...s,
              status: STATUS.STOCK,
              jobName: "",
              history: [...(s.history || []), { event: "Returned to stock", date: new Date().toISOString().slice(0, 10) }],
            }
          : s
      )
    );
    setDetailSlab(null);
  };

  // Releasing a hold is distinct from the generic "undo cut" return-to-stock:
  // it clears every reservation-specific field (job, customer, job #, sales rep,
  // hold expiration) since the material is now free again. Sales order #/invoice #
  // are left alone since those are separate business records, not hold context.
  const releaseHold = (slab) => {
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === slab.id
          ? {
              ...s,
              status: STATUS.STOCK,
              jobName: "",
              customerName: "",
              jobNumber: "",
              holdExpires: "",
              salesRep: "",
              history: [...(s.history || []), { event: "Hold released — returned to stock" + actorTag(), date: new Date().toISOString().slice(0, 10) }],
            }
          : s
      )
    );
    setDetailSlab(null);
  };

  // "Pulled for Fabrication" is an orthogonal flag layered on top of whatever status
  // a slab is already in (in stock or reserved) — it tracks that the shop floor has
  // physically taken it out of the yard, without changing its inventory status or
  // clearing any job/reservation info. Marking it cut & used clears the flag too.
  const markPulledForFab = (slab) => {
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === slab.id
          ? {
              ...s,
              pulledForFab: true,
              pulledDate: todayStr(),
              pulledBy: currentUser || "",
              history: [...(s.history || []), { event: "Pulled for fabrication" + actorTag(), date: todayStr() }],
            }
          : s
      )
    );
  };

  const returnToYard = (slab) => {
    setSlabs((prev) =>
      prev.map((s) =>
        s.id === slab.id
          ? {
              ...s,
              pulledForFab: false,
              pulledDate: "",
              pulledBy: "",
              history: [...(s.history || []), { event: "Returned to yard (not used)" + actorTag(), date: todayStr() }],
            }
          : s
      )
    );
  };

  useEffect(() => {
    if (!labelSlab) return;
    setBarcodeError(false);
    loadJsBarcode()
      .then((JsBarcode) => {
        if (barcodeCanvasRef.current && labelSlab) {
          JsBarcode(barcodeCanvasRef.current, labelSlab.barcode, {
            format: "CODE128",
            displayValue: true,
            fontSize: 14,
            height: 46,
            margin: 8,
            width: 2,
          });
        }
      })
      .catch(() => setBarcodeError(true));
  }, [labelSlab]);

  useEffect(() => {
    if (!labelQueue || !labelQueue.length) return;
    loadJsBarcode()
      .then((JsBarcode) => {
        labelQueue.forEach((slab) => {
          const canvas = labelQueueCanvases.current.get(slab.id);
          if (canvas) {
            JsBarcode(canvas, slab.barcode, {
              format: "CODE128",
              displayValue: true,
              fontSize: 12,
              height: 36,
              margin: 6,
              width: 1.6,
            });
          }
        });
      })
      .catch(() => setBarcodeError(true));
  }, [labelQueue]);

  useEffect(() => {
    if (!labelSlab || !qrCodeRef.current) return;
    qrCodeRef.current.innerHTML = "";
    loadQRCodeLib()
      .then((QRCode) => {
        if (qrCodeRef.current) {
          new QRCode(qrCodeRef.current, { text: labelSlab.barcode, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
        }
      })
      .catch(() => {});
  }, [labelSlab]);

  useEffect(() => {
    if (!holdLabelSlab) return;
    setBarcodeError(false);
    loadJsBarcode()
      .then((JsBarcode) => {
        if (holdBarcodeCanvasRef.current) {
          JsBarcode(holdBarcodeCanvasRef.current, holdLabelSlab.barcode, {
            format: "CODE128",
            displayValue: true,
            fontSize: 12,
            height: 36,
            margin: 6,
            width: 1.6,
          });
        }
      })
      .catch(() => setBarcodeError(true));
  }, [holdLabelSlab]);

  useEffect(() => {
    if (!holdLabelSlab || !holdQrCodeRef.current) return;
    holdQrCodeRef.current.innerHTML = "";
    loadQRCodeLib()
      .then((QRCode) => {
        if (holdQrCodeRef.current) {
          new QRCode(holdQrCodeRef.current, { text: holdLabelSlab.barcode, width: 80, height: 80, correctLevel: QRCode.CorrectLevel.M });
        }
      })
      .catch(() => {});
  }, [holdLabelSlab]);

  useEffect(() => {
    if (!labelQueue || !labelQueue.length) return;
    loadQRCodeLib()
      .then((QRCode) => {
        labelQueue.forEach((slab) => {
          const el = labelQueueQRs.current.get(slab.id);
          if (el) {
            el.innerHTML = "";
            new QRCode(el, { text: slab.barcode, width: 84, height: 84, correctLevel: QRCode.CorrectLevel.M });
          }
        });
      })
      .catch(() => {});
  }, [labelQueue]);

  const printLabel = () => {
    window.print();
  };

  // ---- scanning: shared by the keyboard-wedge scan box and camera scanning ----
  const processScannedCode = (code) => {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    const match = slabs.find((s) => (s.barcode || "").toLowerCase() === trimmed.toLowerCase());
    if (auditActive) {
      if (match && auditScope.includes(match.id)) {
        setAuditScannedIds((prev) => new Set(prev).add(match.id));
        setAuditFlash({ ok: true, name: match.materialName });
      } else if (match) {
        setAuditFlash({ ok: false, name: match.materialName, note: "Not part of this check" });
      } else {
        setAuditFlash({ ok: false, name: "Unrecognized code" });
      }
      setTimeout(() => setAuditFlash(null), 1600);
      return;
    }
    if (match) {
      setScanResultSlab(match);
      setScanError(false);
    } else {
      setScanError(true);
    }
  };

  const handleScan = (e) => {
    if (e.key !== "Enter") return;
    processScannedCode(scanValue);
    setScanValue("");
  };

  // ---- camera scanning (QR + barcode) ----
  const closeCameraScan = () => {
    if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    cameraIntervalRef.current = null;
    if (cameraStreamRef.current) cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  };

  const openCameraScan = async () => {
    setCameraError("");
    setCameraOpen(true);
    if (!("BarcodeDetector" in window)) {
      setCameraError("Camera scanning isn't supported in this browser. Use the scan box above with a USB/Bluetooth scanner, or type the code in manually.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128"] });
      cameraIntervalRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) {
            const value = codes[0].rawValue;
            const now = Date.now();
            if (value === lastScanRef.current.code && now - lastScanRef.current.time < 2000) return;
            lastScanRef.current = { code: value, time: now };
            processScannedCode(value);
            if (!auditActive) closeCameraScan();
          }
        } catch (e) {
          // ignore per-frame detection errors
        }
      }, 400);
    } catch (e) {
      setCameraError("Couldn't access the camera. Check that you've allowed camera permission, or use the scan box above instead.");
    }
  };

  useEffect(() => {
    return () => {
      if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
      if (cameraStreamRef.current) cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ---- inventory check (audit) ----
  const startAudit = () => {
    setAuditScope(filtered.map((s) => s.id));
    setAuditScannedIds(new Set());
    setAuditActive(true);
  };

  const cancelAudit = () => {
    setAuditActive(false);
    setAuditScope([]);
    setAuditScannedIds(new Set());
  };

  const finishAudit = () => {
    const today = new Date().toISOString().slice(0, 10);
    setSlabs((prev) =>
      prev.map((s) => {
        if (!auditScope.includes(s.id)) return s;
        if (auditScannedIds.has(s.id)) {
          if (!s.flaggedMissing) return s;
          return { ...s, flaggedMissing: false, history: [...(s.history || []), { event: "Confirmed present in inventory check", date: today }] };
        }
        return { ...s, flaggedMissing: true, history: [...(s.history || []), { event: "Not scanned during inventory check — flagged for review", date: today }] };
      })
    );
    setAuditActive(false);
    setAuditScope([]);
    setAuditScannedIds(new Set());
  };

  const clearMissingFlag = (slab) => {
    setSlabs((prev) =>
      prev.map((s) => (s.id === slab.id ? { ...s, flaggedMissing: false, history: [...(s.history || []), { event: "Marked as located", date: new Date().toISOString().slice(0, 10) }] } : s))
    );
  };

  const COMMON_COLORS = ["White", "Black", "Grey", "Beige", "Brown", "Gold", "Blue", "Green", "Red", "Multicolor"];
  const colorOptions = useMemo(() => {
    const set = new Set(COMMON_COLORS);
    slabs.forEach((s) => { if (s.color) set.add(s.color); });
    orders.forEach((o) => { if (o.color) set.add(o.color); });
    return Array.from(set).sort();
  }, [slabs, orders]);
  const uniqueSlabColors = useMemo(() => Array.from(new Set(slabs.map((s) => s.color).filter(Boolean))).sort(), [slabs]);
  const uniqueSlabMaterialNames = useMemo(() => Array.from(new Set(slabs.map((s) => s.materialName).filter(Boolean))).sort(), [slabs]);
  const uniqueOrderColors = useMemo(() => Array.from(new Set(orders.map((o) => o.color).filter(Boolean))).sort(), [orders]);

  const ordersFiltered = useMemo(() => {
    return orders.filter((o) => {
      if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) return false;
      if (orderColorFilter && o.color !== orderColorFilter) return false;
      if (orderMaterialTypeFilter && o.materialType !== orderMaterialTypeFilter) return false;
      if (orderVendorFilter && o.vendor !== orderVendorFilter) return false;
      if (orderThicknessFilter && o.thickness !== orderThicknessFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.trim().toLowerCase();
        if (!`${o.materialName} ${o.color || ""} ${o.materialType || ""} ${o.vendor} ${o.jobName || ""} ${o.salesOrderNumber || ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
  }, [orders, orderStatusFilter, orderColorFilter, orderMaterialTypeFilter, orderVendorFilter, orderThicknessFilter, orderSearch]);

  const openAddOrder = () => {
    setOrderForm(emptyOrderForm());
    setEditingOrderId(null);
    setOrderFormOpen(true);
  };

  const openEditOrder = (order) => {
    setOrderForm({
      materialName: order.materialName,
      materialType: order.materialType || "",
      color: order.color || "",
      vendor: order.vendor,
      thickness: order.thickness,
      quantity: String(order.quantity || 1),
      lengthIn: order.lengthIn || "",
      widthIn: order.widthIn || "",
      owner: order.owner,
      orderDate: order.orderDate,
      expectedDate: order.expectedDate || "",
      lotNumber: order.lotNumber || "",
      jobName: order.jobName || "",
      salesOrderNumber: order.salesOrderNumber || "",
      notes: order.notes || "",
    });
    setEditingOrderId(order.id);
    setOrderFormOpen(true);
  };

  const saveOrder = () => {
    if (!orderForm.materialName.trim()) return;
    if (editingOrderId) {
      setOrders((prev) => prev.map((o) => (o.id === editingOrderId ? { ...o, ...orderForm } : o)));
    } else {
      setOrders((prev) => [{ id: uid(), ...orderForm, status: "ordered" }, ...prev]);
    }
    setOrderFormOpen(false);
  };

  const cancelOrder = (order) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o)));
    setConfirmCancelOrder(null);
  };

  const deleteOrder = (order) => {
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    setConfirmDeleteOrder(null);
  };

  // Receiving an order pre-fills Fast Add with the expected quantity/size, then
  // marks the order as received once those slabs are actually saved into inventory.
  // If the order was placed for a specific job, the received slabs come in already
  // reserved for that job, carrying the sales order # along with them.
  const receiveOrder = (order) => {
    const defaults = {
      vendor: order.vendor || "",
      lotNumber: order.lotNumber || "",
      owner: order.owner || "Shop",
      thickness: order.thickness || "3cm",
      lengthIn: order.lengthIn || "",
      widthIn: order.widthIn || "",
      color: order.color || "",
      materialType: order.materialType || "",
      dateReceived: todayStr(),
    };
    setBulkDefaults(defaults);
    const qty = Math.max(1, parseInt(order.quantity, 10) || 1);
    setBulkRows(Array.from({ length: qty }, () => ({ ...emptyBulkRow(defaults), materialName: order.materialName })));
    setReceivingOrderId(order.id);
    setBulkOpen(true);
  };

  const addBuilder = () => {
    const name = newBuilderName.trim();
    if (!name || builders.includes(name)) return;
    setBuilders((prev) => [...prev, name]);
    setNewBuilderName("");
    setAddBuilderOpen(false);
    setActiveTab(name);
  };

  const deleteBuilder = (name) => {
    setBuilders((prev) => prev.filter((b) => b !== name));
    // any slabs owned by this builder move back to Shop stock rather than being deleted
    setSlabs((prev) => prev.map((s) => (s.owner === name ? { ...s, owner: "Shop" } : s)));
    if (activeTab === name) setActiveTab("all");
    setConfirmDeleteBuilder(null);
  };

  const addVendor = () => {
    const name = newVendorName.trim();
    if (!name || vendors.includes(name)) return;
    setVendors((prev) => [...prev, name]);
    setForm((f) => ({ ...f, vendor: name }));
    setNewVendorName("");
    setAddVendorOpen(false);
  };

  const addSalesRep = () => {
    const name = newSalesRepName.trim();
    if (!name || salesReps.includes(name)) return;
    setSalesReps((prev) => [...prev, name]);
    setReserveSalesRep(name);
    setNewSalesRepName("");
    setAddSalesRepOpen(false);
  };

  useEffect(() => {
    if (!detailSlab || !detailSlab.hasPhoto) {
      setDetailPhotoUrl(null);
      return;
    }
    setDetailPhotoLoading(true);
    window.storage.get(`photo:${detailSlab.id}`, true)
      .then((res) => setDetailPhotoUrl(res && res.value ? res.value : null))
      .catch(() => setDetailPhotoUrl(null))
      .finally(() => setDetailPhotoLoading(false));
  }, [detailSlab]);

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

        :root {
          --stone: #1c2321;
          --stone-soft: #3a4340;
          --quartz: #eeeee7;
          --quartz-dim: #e2e1d8;
          --line: #d3d2c6;
          --brass: #b8912f;
          --brass-dim: #d9c07a;
          --paper: #f7f6f1;
          --ok: #4c7a5e;
          --ok-bg: #e3ede6;
          --warn: #a9772c;
          --warn-bg: #f3e6cf;
          --done: #7a7568;
          --done-bg: #e6e4da;
          --danger: #a3423a;
        }

        * { box-sizing: border-box; }

        .app {
          font-family: 'Inter', sans-serif;
          background: var(--paper);
          color: var(--stone);
          min-height: 100vh;
          padding: 0;
        }

        .mono { font-family: 'JetBrains Mono', monospace; }

        .topbar {
          background: var(--stone);
          color: var(--quartz);
          padding: 20px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          border-bottom: 3px solid var(--brass);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-mark {
          width: 38px; height: 38px;
          border-radius: 6px;
          background: linear-gradient(135deg, var(--brass) 0%, var(--brass-dim) 45%, var(--stone-soft) 100%);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .brand h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0.2px;
        }
        .brand p {
          margin: 0;
          font-size: 12px;
          color: var(--brass-dim);
          text-transform: uppercase;
          letter-spacing: 1.2px;
        }

        .topbar-actions { display: flex; gap: 10px; align-items: center; }
        .user-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--brass-dim);
          border-left: 1px solid rgba(255,255,255,0.15);
          padding-left: 12px;
          margin-left: 2px;
        }

        .btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13.5px;
          border: none;
          border-radius: 7px;
          padding: 10px 16px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition: transform 0.08s ease, opacity 0.15s ease;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: var(--brass); color: var(--stone); }
        .btn-primary:hover { background: var(--brass-dim); }
        .btn-ghost { background: rgba(255,255,255,0.08); color: var(--quartz); }
        .btn-ghost:hover { background: rgba(255,255,255,0.16); }
        .btn-ghost.active { background: var(--brass); color: var(--stone); }
        .btn-outline { background: transparent; border: 1.5px solid var(--line); color: var(--stone); }
        .btn-outline:hover { background: var(--quartz-dim); }
        .btn-sm { padding: 7px 11px; font-size: 12.5px; border-radius: 6px; }
        .btn-danger { background: var(--danger); color: white; }
        .btn-block { width: 100%; justify-content: center; }

        .page-switch {
          display: flex;
          gap: 8px;
          padding: 14px 28px 0;
          background: var(--paper);
        }
        .page-switch button {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 13.5px;
          padding: 10px 18px;
          border-radius: 8px;
          cursor: pointer;
          color: var(--stone-soft);
          background: var(--quartz-dim);
          border: 1.5px solid transparent;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .page-switch button.active {
          background: var(--stone);
          color: white;
        }

        .tabbar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 14px 28px 0;
          flex-wrap: wrap;
          background: var(--paper);
        }
        .tab {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600;
          font-size: 13.5px;
          padding: 10px 16px;
          border-radius: 8px 8px 0 0;
          cursor: pointer;
          color: var(--stone-soft);
          border: 1.5px solid transparent;
          border-bottom: none;
          display: flex; align-items: center; gap: 7px;
        }
        .tab .count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          background: var(--quartz-dim);
          padding: 1px 6px;
          border-radius: 20px;
        }
        .tab.active {
          background: white;
          color: var(--stone);
          border-color: var(--line);
          border-bottom: 1.5px solid white;
          margin-bottom: -1.5px;
        }
        .tab.active .count { background: var(--brass); color: white; }
        .tab-remove {
          background: transparent;
          border: none;
          padding: 2px;
          margin-left: 2px;
          display: flex;
          align-items: center;
          color: var(--stone-soft);
          cursor: pointer;
          border-radius: 4px;
        }
        .tab-remove:hover { background: rgba(163,66,58,0.15); color: var(--danger); }
        .tab-add {
          color: var(--brass);
          font-size: 13px;
        }

        .scan-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--stone);
          border-radius: 10px;
          margin: 0 28px;
          padding: 12px 16px;
          border: 1.5px solid var(--brass);
        }
        .scan-bar input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--quartz);
          font-size: 13.5px;
        }
        .scan-bar input::placeholder { color: #8a9490; }
        .scan-error {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; color: #e8b4ac;
          white-space: nowrap;
        }
        .scan-camera-btn {
          background: var(--brass);
          border: none;
          border-radius: 7px;
          padding: 7px 9px;
          color: var(--stone);
          cursor: pointer;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .scan-camera-btn:hover { background: var(--brass-dim); }

        .audit-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: var(--warn-bg);
          border: 1.5px solid var(--warn);
          border-radius: 10px;
          margin: 14px 28px 0;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--warn);
        }
        .audit-banner-actions { display: flex; gap: 8px; margin-left: auto; }
        .audit-flash {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 20px;
        }
        .audit-flash.ok { background: var(--ok-bg); color: var(--ok); }
        .audit-flash.bad { background: rgba(163,66,58,0.15); color: var(--danger); }

        .camera-video { width: 100%; border-radius: 10px; background: #000; max-height: 320px; object-fit: cover; }

        .missing-note {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12.5px;
          color: var(--danger);
          background: rgba(163,66,58,0.1);
          padding: 9px 12px;
          border-radius: 8px;
        }

        .pulled-note {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12.5px;
          color: var(--stone-soft);
          background: var(--quartz);
          padding: 9px 12px;
          border-radius: 8px;
        }
        .pulled-tag { background: var(--quartz-dim); }

        .view-toggle { display: flex; border: 1.5px solid var(--line); border-radius: 7px; overflow: hidden; }
        .view-toggle button {
          background: white;
          border: none;
          padding: 9px 10px;
          cursor: pointer;
          color: var(--stone-soft);
          display: flex;
        }
        .view-toggle button + button { border-left: 1.5px solid var(--line); }
        .view-toggle button.active { background: var(--brass); color: white; }

        .label-codes { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
        .label-qr { display: flex; }

        .label-sheet {
          background: white;
          border: 1.5px dashed var(--line);
          border-radius: 10px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 4px;
        }
        .label-material { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }
        .label-line { font-size: 12.5px; color: var(--stone-soft); }
        .label-sheet canvas { margin-top: 8px; max-width: 100%; }

        .hold-label-banner {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 800;
          font-size: 20px;
          letter-spacing: 2px;
          color: white;
          background: var(--danger);
          padding: 6px 20px;
          border-radius: 20px;
          margin-bottom: 4px;
        }
        .hold-label-divider { width: 100%; height: 1px; background: var(--line); margin: 4px 0; }
        .hold-label-strong { color: var(--stone); font-weight: 600; font-size: 13.5px; }
        .hold-label-expiry { font-weight: 700; color: var(--warn); }
        .hold-label-expiry.expired { color: var(--danger); }

        .batch-label-wrap { display: flex; flex-direction: column; gap: 12px; }
        .batch-label-sheet { margin-bottom: 0; }

        @media print {
          body * { visibility: hidden !important; }
          .print-target, .print-target * { visibility: visible !important; }
          .print-target {
            position: absolute;
            top: 0; left: 0;
            width: auto;
            border: none;
          }
          .batch-label-sheet {
            page-break-after: always;
            border: none;
          }
          .batch-label-sheet:last-child { page-break-after: auto; }
          .no-print { display: none !important; }
        }

        .toolbar {
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 0 10px 10px 10px;
          margin: 0 28px 24px;
          padding: 16px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .search-box {
          flex: 1;
          min-width: 200px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--quartz);
          border-radius: 7px;
          padding: 9px 12px;
          border: 1.5px solid var(--line);
        }
        .search-box input {
          border: none; background: transparent; outline: none;
          font-family: 'Inter', sans-serif; font-size: 13.5px; width: 100%;
          color: var(--stone);
        }

        select {
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 500;
          padding: 9px 12px;
          border-radius: 7px;
          border: 1.5px solid var(--line);
          background: white;
          color: var(--stone);
        }

        .remnant-filter {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
          color: var(--stone-soft);
          background: var(--quartz);
          border: 1.5px solid var(--line);
          border-radius: 7px;
          padding: 9px 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .remnant-filter input { width: 15px; height: 15px; margin: 0; accent-color: var(--brass); }

        .content { padding: 0 28px 60px; }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .card {
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.1s ease;
          display: flex;
          flex-direction: column;
        }
        .card:hover { box-shadow: 0 6px 18px rgba(28,35,33,0.1); transform: translateY(-1px); }

        .card-vein {
          height: 10px;
          background: linear-gradient(90deg, var(--stone-soft), var(--brass-dim) 30%, var(--stone-soft) 55%, var(--brass) 80%, var(--stone-soft));
          opacity: 0.85;
        }
        .card-vein.status-reserved { background: linear-gradient(90deg, var(--warn-bg), var(--warn), var(--warn-bg)); }
        .card-vein.status-cut { background: var(--done); opacity: 0.5; }

        .card-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }

        .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .card-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; line-height: 1.25; }
        .card-sub { font-size: 12px; color: var(--stone-soft); margin-top: 2px; }

        .badge {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 4px 8px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .badge-stock { background: var(--ok-bg); color: var(--ok); }
        .badge-reserved { background: var(--warn-bg); color: var(--warn); }
        .badge-cut { background: var(--done-bg); color: var(--done); }
        .badge-remnant { background: rgba(184,145,47,0.18); color: var(--brass); }
        .badge-missing { background: rgba(163,66,58,0.15); color: var(--danger); }
        .badge-pulled { background: rgba(58,67,64,0.12); color: var(--stone-soft); }
        .badge-doc-invoice { background: rgba(76,122,94,0.16); color: var(--ok); }
        .badge-doc-sales_order { background: rgba(184,145,47,0.18); color: var(--brass); }
        .badge-doc-other { background: var(--done-bg); color: var(--done); }
        .badge-order-ordered { background: var(--warn-bg); color: var(--warn); }
        .badge-order-received { background: var(--ok-bg); color: var(--ok); }
        .badge-order-cancelled { background: var(--done-bg); color: var(--done); }

        .slab-list {
          display: flex;
          flex-direction: column;
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
        }
        .list-row {
          display: flex;
          align-items: stretch;
          gap: 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--line);
          transition: background 0.1s ease;
        }
        .list-row:last-child { border-bottom: none; }
        .list-row:hover { background: var(--quartz); }
        .list-status-bar {
          width: 5px;
          flex-shrink: 0;
          background: var(--ok);
        }
        .list-status-bar.status-reserved { background: var(--warn); }
        .list-status-bar.status-cut { background: var(--done); }
        .list-main {
          flex: 1;
          min-width: 0;
          padding: 12px 4px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .list-top-line {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
        }
        .list-name {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 14.5px;
        }
        .list-sub-line {
          font-size: 12px;
          color: var(--stone-soft);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .list-job {
          font-size: 12px;
          color: var(--brass);
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .list-price {
          flex-shrink: 0;
          padding: 12px 16px;
          text-align: right;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-left: 1px dashed var(--line);
          min-width: 100px;
        }

        .card-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 10px;
          font-size: 12.5px;
        }
        .card-meta div span { display: block; }
        .meta-label { color: var(--stone-soft); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
        .meta-val { font-family: 'JetBrains Mono', monospace; font-weight: 500; }

        .card-price-row {
          display: flex; justify-content: space-between; align-items: center;
          border-top: 1px dashed var(--line);
          padding-top: 10px; margin-top: auto;
        }
        .price-main { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 15px; }
        .price-sub { font-size: 11px; color: var(--stone-soft); }

        .job-tag {
          font-size: 12px;
          background: var(--quartz);
          border-radius: 6px;
          padding: 6px 9px;
          display: flex; align-items: center; gap: 6px;
          color: var(--stone-soft);
        }
        .job-tag b { color: var(--stone); }

        .hold-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          background: var(--quartz);
          border: 1.5px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
        }
        .hold-box-row { display: flex; align-items: center; gap: 8px; color: var(--stone-soft); }
        .hold-box.expired { background: rgba(163,66,58,0.1); border-color: var(--danger); }
        .hold-box.expired .hold-box-row { color: var(--danger); }

        .order-list { display: flex; flex-direction: column; gap: 14px; }
        .order-card {
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .order-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .order-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }
        .order-sub { font-size: 12.5px; color: var(--stone-soft); margin-top: 2px; }
        .order-dates { font-size: 12px; color: var(--stone-soft); }
        .order-notes { font-size: 13px; color: var(--stone); }

        .empty {
          text-align: center;
          padding: 70px 20px;
          color: var(--stone-soft);
        }
        .empty h3 { font-family: 'Space Grotesk', sans-serif; color: var(--stone); margin-bottom: 6px; }

        /* modal */
        .overlay {
          position: fixed; inset: 0;
          background: rgba(28,35,33,0.55);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          z-index: 50;
        }
        .modal {
          background: var(--paper);
          border-radius: 14px;
          max-width: 560px; width: 100%;
          max-height: 88vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px 24px;
          border-bottom: 1.5px solid var(--line);
          background: white;
          border-radius: 14px 14px 0 0;
          position: sticky; top: 0; z-index: 2;
        }
        .modal-header h2 { font-family: 'Space Grotesk', sans-serif; font-size: 18px; margin: 0; }
        .icon-btn {
          background: transparent; border: none; cursor: pointer;
          color: var(--stone-soft); padding: 6px; border-radius: 6px;
          display: flex;
        }
        .icon-btn:hover { background: var(--quartz-dim); }

        .modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; }

        .field { display: flex; flex-direction: column; gap: 6px; }
        .field label { font-size: 12px; font-weight: 600; color: var(--stone-soft); text-transform: uppercase; letter-spacing: 0.4px; }
        .field input, .field select, .field textarea {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          padding: 10px 12px;
          border: 1.5px solid var(--line);
          border-radius: 8px;
          background: white;
          color: var(--stone);
          outline: none;
        }
        .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--brass); }
        .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

        .sqft-pill {
          align-self: flex-start;
          background: var(--quartz);
          border-radius: 20px;
          padding: 5px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          color: var(--stone-soft);
        }

        .cost-toggle {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--quartz);
          border: 1.5px dashed var(--line);
          border-radius: 9px;
          padding: 11px 14px;
          cursor: pointer;
        }
        .cost-toggle span { font-size: 13px; font-weight: 600; color: var(--stone-soft); display: flex; align-items: center; gap: 8px; }

        .pricing-box {
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 10px;
          padding: 14px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .pricing-box .hint { font-size: 12px; color: var(--stone-soft); }

        .cost-breakdown {
          background: var(--quartz);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cost-breakdown-row {
          display: flex; justify-content: space-between;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          color: var(--stone-soft);
        }
        .cost-breakdown-row.total {
          font-weight: 700;
          color: var(--stone);
          border-top: 1px dashed var(--line);
          padding-top: 6px;
          margin-top: 2px;
        }
        .margin-line {
          display: flex; justify-content: space-between;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          padding-top: 8px;
          border-top: 1px dashed var(--line);
        }

        .fee-input { display: flex; flex-direction: column; gap: 6px; }
        .fee-input input { width: 100%; }
        .fee-input select { width: 100%; padding: 10px 12px; }

        .kind-toggle {
          display: flex;
          border: 1.5px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .kind-toggle button {
          flex: 1;
          border: none;
          background: white;
          padding: 10px;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--stone-soft);
          cursor: pointer;
        }
        .kind-toggle button + button { border-left: 1.5px solid var(--line); }
        .kind-toggle button.active { background: var(--brass); color: white; }

        .shape-mini { display: flex; flex-direction: column; gap: 8px; }
        .shape-readout {
          display: flex; justify-content: space-between;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          color: var(--stone-soft);
        }

        .edge-edit-popover {
          position: absolute;
          transform: translate(-50%, -50%);
          background: white;
          border: 1.5px solid var(--brass);
          border-radius: 6px;
          padding: 4px 8px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 6px 16px rgba(28,35,33,0.25);
          z-index: 5;
        }
        .edge-edit-popover input {
          width: 56px;
          border: none;
          outline: none;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          text-align: center;
        }
        .edge-edit-popover span { font-size: 11px; color: var(--stone-soft); }

        .checkbox-label {
          display: flex !important;
          flex-direction: row !important;
          align-items: center;
          gap: 6px;
          text-transform: none !important;
          font-weight: 500 !important;
          font-size: 12px !important;
          color: var(--stone-soft) !important;
          margin-top: 4px;
          cursor: pointer;
        }
        .checkbox-label input[type="checkbox"] { width: 14px; height: 14px; margin: 0; }

        .photo-upload {
          border: 1.5px dashed var(--line);
          border-radius: 8px;
          padding: 16px;
          text-align: center;
          font-size: 13px;
          color: var(--stone-soft);
          cursor: pointer;
          background: var(--quartz);
          display: block;
        }
        .photo-upload:hover { background: var(--quartz-dim); }
        .photo-preview { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
        .photo-preview img { width: 100%; max-height: 220px; object-fit: cover; border-radius: 8px; border: 1.5px solid var(--line); }

        .detail-photo-block { display: flex; flex-direction: column; gap: 8px; }
        .detail-photo { width: 100%; max-height: 260px; object-fit: cover; border-radius: 10px; border: 1.5px solid var(--line); }
        .photo-link { font-size: 12.5px; color: var(--brass); font-weight: 600; text-decoration: none; }
        .photo-link:hover { text-decoration: underline; }

        .modal-footer {
          padding: 16px 24px 22px;
          display: flex; gap: 10px;
          position: sticky; bottom: 0;
          background: var(--paper);
        }

        /* detail modal */
        .detail-status-row { display: flex; justify-content: space-between; align-items: center; }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
        .detail-item .meta-label { margin-bottom: 3px; }
        .detail-item .meta-val { font-size: 14px; }
        .cost-reveal-note {
          font-size: 12px; color: var(--warn);
          background: var(--warn-bg);
          padding: 8px 11px; border-radius: 8px;
        }
        .action-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .history-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .history-item { font-size: 12.5px; color: var(--stone-soft); display: flex; justify-content: space-between; gap: 10px; }
        .history-item span:last-child { font-family: 'JetBrains Mono', monospace; }
        .divider { height: 1px; background: var(--line); border: none; margin: 4px 0; }

        .documents-header { display: flex; justify-content: space-between; align-items: center; }
        .doc-list { display: flex; flex-direction: column; gap: 8px; }
        .doc-item {
          display: flex;
          align-items: center;
          gap: 10px;
          background: white;
          border: 1.5px solid var(--line);
          border-radius: 8px;
          padding: 9px 11px;
        }
        .doc-info { flex: 1; min-width: 0; }
        .doc-name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .doc-date { font-size: 11px; color: var(--stone-soft); font-family: 'JetBrains Mono', monospace; }
        .doc-actions { display: flex; gap: 2px; flex-shrink: 0; }

        .bulk-rows { display: flex; flex-direction: column; gap: 12px; }
        .bulk-row {
          border: 1.5px solid var(--line);
          border-radius: 10px;
          padding: 12px;
          background: white;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bulk-row-head { display: flex; justify-content: space-between; align-items: center; }

        .print-options { display: flex; gap: 10px; flex-wrap: wrap; }

        .print-list-sheet {
          background: white;
          border: 1.5px dashed var(--line);
          border-radius: 10px;
          padding: 16px;
          overflow-x: auto;
        }
        .print-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
        }
        .print-table th, .print-table td {
          border: 1px solid var(--line);
          padding: 6px 8px;
          text-align: left;
          white-space: nowrap;
        }
        .print-table th {
          background: var(--quartz);
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.3px;
        }
        .print-table td { font-family: 'JetBrains Mono', monospace; }

        .save-warning {
          background: var(--danger); color: white; font-size: 12.5px;
          padding: 8px 28px; text-align: center;
        }

        @media (max-width: 620px) {
          .row-2, .row-3 { grid-template-columns: 1fr; }
          .detail-grid { grid-template-columns: 1fr; }
          .topbar { padding: 16px; }
          .content, .tabbar { padding-left: 16px; padding-right: 16px; }
          .toolbar, .scan-bar, .audit-banner { margin-left: 16px; margin-right: 16px; }
          .modal-footer { flex-wrap: wrap; }
          .modal-footer .btn-block { flex: 1 1 100%; }
          .list-row { flex-direction: column; }
          .list-status-bar { width: 100%; height: 4px; }
          .list-price { border-left: none; border-top: 1px dashed var(--line); text-align: left; flex-direction: row; gap: 10px; align-items: baseline; }
        }
      `}</style>

      {saveError && <div className="save-warning">Changes aren't saving right now — check your connection and keep this tab open.</div>}

      <datalist id="color-options">
        {colorOptions.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={19} color="#1c2321" strokeWidth={2.25} /></div>
          <div>
            <h1>Slab Lab</h1>
            <p>Material Inventory</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className={`btn btn-ghost ${showCosts ? "active" : ""}`} onClick={() => setShowCosts((v) => !v)}>
            {showCosts ? <Eye size={15} /> : <EyeOff size={15} />}
            {showCosts ? "Costs Visible" : "Costs Hidden"}
          </button>
          {page === "inventory" ? (
            <>
              <button className="btn btn-ghost" onClick={() => setPrintListOpen(true)}><Printer size={15} /> Print List</button>
              <button className="btn btn-ghost" onClick={openBulkAdd}><ListChecks size={15} /> Fast Add</button>
              <button className="btn btn-ghost" onClick={startAudit}><ClipboardCheck size={15} /> Inventory Check</button>
              <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Slab</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={openAddOrder}><Plus size={16} /> Order Materials</button>
          )}
          {currentUser && (
            <div className="user-badge">
              <span>{currentUser}</span>
              <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
            </div>
          )}
        </div>
      </div>

      <div className="page-switch">
        <button className={page === "inventory" ? "active" : ""} onClick={() => setPage("inventory")}><Package size={14} /> Inventory</button>
        <button className={page === "orders" ? "active" : ""} onClick={() => setPage("orders")}>
          <Truck size={14} /> Material Orders{orders.filter((o) => o.status === "ordered").length ? ` (${orders.filter((o) => o.status === "ordered").length})` : ""}
        </button>
      </div>

      {page === "inventory" && (
      <div className="tabbar">
        <div className={`tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          <Package size={14} /> All <span className="count">{counts.all}</span>
        </div>
        <div className={`tab ${activeTab === "Shop" ? "active" : ""}`} onClick={() => setActiveTab("Shop")}>
          <Hammer size={14} /> Shop Stock <span className="count">{counts["Shop"] || 0}</span>
        </div>
        {builders.map((b) => (
          <div key={b} className={`tab ${activeTab === b ? "active" : ""}`} onClick={() => setActiveTab(b)}>
            <Building2 size={14} /> {b} <span className="count">{counts[b] || 0}</span>
            <button
              className="tab-remove"
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteBuilder(b); }}
              title={`Remove ${b}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="tab tab-add" onClick={() => setAddBuilderOpen(true)}>
          <Plus size={14} /> Builder
        </div>
      </div>
      )}

      {page === "inventory" && (
      <>
      {auditActive && (
        <div className="audit-banner">
          <ClipboardCheck size={16} />
          <span>Inventory check: <b>{auditScannedIds.size}</b> of <b>{auditScope.length}</b> scanned</span>
          {auditFlash && (
            <span className={`audit-flash ${auditFlash.ok ? "ok" : "bad"}`}>{auditFlash.name}{auditFlash.note ? ` — ${auditFlash.note}` : ""}</span>
          )}
          <div className="audit-banner-actions">
            <button className="btn btn-ghost btn-sm" onClick={cancelAudit}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={finishAudit}>Finish Check</button>
          </div>
        </div>
      )}

      <div className="scan-bar">
        <ScanLine size={17} color="#b8912f" />
        <input
          ref={scanInputRef}
          className="mono"
          placeholder={auditActive ? "Scan slabs one after another…" : "Scan a slab's barcode or QR code, or type it and press Enter"}
          value={scanValue}
          onChange={(e) => { setScanValue(e.target.value); setScanError(false); }}
          onKeyDown={handleScan}
        />
        {scanError && <span className="scan-error"><AlertCircle size={13} /> No slab with that code</span>}
        <button className="scan-camera-btn" onClick={openCameraScan} title="Scan with camera"><Camera size={16} /></button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="#3a4340" />
          <input placeholder="Search name, lot #, vendor, job, customer, job #..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">In Stock (all on-hand)</option>
          <option value={STATUS.STOCK}>Available only (unreserved)</option>
          <option value={STATUS.RESERVED}>Reserved only</option>
          <option value={STATUS.CUT}>Cut & Used only</option>
          <option value="all">All statuses</option>
        </select>
        <label className="remnant-filter">
          <input type="checkbox" checked={remnantOnly} onChange={(e) => setRemnantOnly(e.target.checked)} />
          Remnants only
        </label>
        <label className="remnant-filter">
          <input type="checkbox" checked={notScannedOnly} onChange={(e) => setNotScannedOnly(e.target.checked)} />
          Not scanned only
        </label>
        <label className="remnant-filter">
          <input type="checkbox" checked={expiredHoldsOnly} onChange={(e) => setExpiredHoldsOnly(e.target.checked)} />
          Expired holds only
        </label>
        <label className="remnant-filter">
          <input type="checkbox" checked={pulledForFabOnly} onChange={(e) => setPulledForFabOnly(e.target.checked)} />
          Pulled for fab only
        </label>
        <div className="view-toggle">
          <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title="List view"><List size={15} /></button>
          <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} title="Grid view"><LayoutGrid size={15} /></button>
        </div>
        <button className={`btn btn-outline btn-sm ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((v) => !v)}>
          More Filters <ChevronDown size={14} style={{ transform: filtersOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
      </div>

      {filtersOpen && (
        <div className="toolbar filters-panel">
          <div className="field">
            <label>Color</label>
            <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}>
              <option value="">All colors</option>
              {uniqueSlabColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Material name</label>
            <select value={materialNameFilter} onChange={(e) => setMaterialNameFilter(e.target.value)}>
              <option value="">All names</option>
              {uniqueSlabMaterialNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Material type</label>
            <select value={materialTypeFilterInv} onChange={(e) => setMaterialTypeFilterInv(e.target.value)}>
              <option value="">All types</option>
              {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Vendor</label>
            <select value={vendorFilterInv} onChange={(e) => setVendorFilterInv(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Thickness</label>
            <select value={thicknessFilterInv} onChange={(e) => setThicknessFilterInv(e.target.value)}>
              <option value="">All thicknesses</option>
              <option>2cm</option>
              <option>3cm</option>
              <option>1.2cm</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field">
            <label>Min sq ft</label>
            <input type="number" value={minSqftFilter} onChange={(e) => setMinSqftFilter(e.target.value)} placeholder="e.g. 30" />
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setColorFilter(""); setMaterialNameFilter(""); setMaterialTypeFilterInv(""); setVendorFilterInv(""); setThicknessFilterInv(""); setMinSqftFilter(""); }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="content">
        {filtered.length === 0 ? (
          <div className="empty">
            <h3>No slabs match here yet</h3>
            <p>Add a slab or adjust your filters to see inventory.</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="slab-list">
            {filtered.map((s) => {
              const sf = getSqft(s);
              const { retail, wholesale } = getPricing(s);
              const hi = holdInfo(s);
              return (
                <div className="list-row" key={s.id} onClick={() => setDetailSlab(s)}>
                  <div className={`list-status-bar status-${s.status}`} />
                  <div className="list-main">
                    <div className="list-top-line">
                      <span className="list-name">{s.materialName}{s.color ? ` — ${s.color}` : ""}</span>
                      {s.kind === "remnant" && <span className="badge badge-remnant">Remnant</span>}
                      {s.flaggedMissing && <span className="badge badge-missing">Not Scanned</span>}
                      {hi && hi.expired && <span className="badge badge-missing">Hold Expired</span>}
                      {s.pulledForFab && <span className="badge badge-pulled">Pulled for Fab</span>}
                      <span className={`badge badge-${s.status === STATUS.STOCK ? "stock" : s.status === STATUS.RESERVED ? "reserved" : "cut"}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <div className="list-sub-line mono">
                      {s.materialType ? `${s.materialType} · ` : ""}{s.kind === "remnant" ? "Irregular" : `${s.lengthIn}"×${s.widthIn}"`} · {sf ? sf.toFixed(1) : "—"} sqft · {s.thickness} · Lot {s.lotNumber || "—"} · {s.vendor || "—"} · {s.owner}
                    </div>
                    {(s.jobName || s.customerName || s.jobNumber) && (
                      <div className="list-job">
                        {s.jobName || "Reserved"}{s.customerName ? ` · ${s.customerName}` : ""}{s.jobNumber ? ` · #${s.jobNumber}` : ""}
                        {hi && !hi.expired && ` · hold ${hi.daysLeft}d left`}
                        {hi && hi.expired && ` · hold expired ${Math.abs(hi.daysLeft)}d ago`}
                      </div>
                    )}
                  </div>
                  <div className="list-price">
                    <div className="price-main">{retail ? money(retail) : "—"}</div>
                    <div className="price-sub">wholesale {wholesale ? money(wholesale) : "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((s) => {
              const sf = getSqft(s);
              const { retail, wholesale, totalCost } = getPricing(s);
              const retailPpsf = sf > 0 && retail ? retail / sf : 0;
              return (
                <div className="card" key={s.id} onClick={() => setDetailSlab(s)}>
                  <div className={`card-vein status-${s.status}`} />
                  <div className="card-body">
                    <div className="card-top">
                      <div>
                        <div className="card-name">
                          {s.materialName}{s.color ? ` — ${s.color}` : ""}
                          {s.kind === "remnant" && <span className="badge badge-remnant" style={{ marginLeft: 6 }}>Remnant</span>}
                          {s.flaggedMissing && <span className="badge badge-missing" style={{ marginLeft: 6 }}>Not Scanned</span>}
                          {s.pulledForFab && <span className="badge badge-pulled" style={{ marginLeft: 6 }}>Pulled for Fab</span>}
                        </div>
                        <div className="card-sub">{s.materialType ? `${s.materialType} · ` : ""}{s.thickness} · Lot {s.lotNumber || "—"}</div>
                        <div className="card-sub mono">{s.barcode}</div>
                      </div>
                      <span className={`badge badge-${s.status === STATUS.STOCK ? "stock" : s.status === STATUS.RESERVED ? "reserved" : "cut"}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>

                    <div className="card-meta">
                      <div><span className="meta-label">Size</span><span className="meta-val">{s.kind === "remnant" ? "Irregular" : `${s.lengthIn}" × ${s.widthIn}"`}</span></div>
                      <div><span className="meta-label">Sq Ft</span><span className="meta-val">{sf ? sf.toFixed(1) : "—"}</span></div>
                      <div><span className="meta-label">Vendor</span><span className="meta-val">{s.vendor || "—"}</span></div>
                      <div><span className="meta-label">Owner</span><span className="meta-val">{s.owner}</span></div>
                    </div>

                    {(s.jobName || s.customerName || s.jobNumber) && (
                      <div className="job-tag">
                        {s.status === STATUS.CUT ? <Scissors size={13} /> : <BadgeCheck size={13} />}
                        <b>{s.jobName || "Reserved"}</b>{s.customerName ? ` · ${s.customerName}` : ""}{s.jobNumber ? ` · #${s.jobNumber}` : ""}
                      </div>
                    )}

                    <div className="card-price-row">
                      <div>
                        <div className="price-main">{retail ? money(retail) : "—"}</div>
                        <div className="price-sub">{retailPpsf ? `${money(retailPpsf)}/sqft retail` : "no price set"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="price-sub">wholesale</div>
                        <div className="meta-val">{wholesale ? money(wholesale) : "—"}</div>
                      </div>
                    </div>
                    {showCosts && (
                      <div className="price-sub" style={{ textAlign: "right" }}>cost {totalCost ? money(totalCost) : "—"}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {page === "orders" && (
        <div className="content">
          <div className="toolbar">
            <div className="search-box">
              <Search size={15} color="#3a4340" />
              <input placeholder="Search material, color, vendor, job, SO #..." value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
            </div>
            <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}>
              <option value="ordered">On order</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
            <button className={`btn btn-outline btn-sm ${orderFiltersOpen ? "active" : ""}`} onClick={() => setOrderFiltersOpen((v) => !v)}>
              More Filters <ChevronDown size={14} style={{ transform: orderFiltersOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          </div>

          {orderFiltersOpen && (
            <div className="toolbar filters-panel">
              <div className="field">
                <label>Color</label>
                <select value={orderColorFilter} onChange={(e) => setOrderColorFilter(e.target.value)}>
                  <option value="">All colors</option>
                  {uniqueOrderColors.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Material type</label>
                <select value={orderMaterialTypeFilter} onChange={(e) => setOrderMaterialTypeFilter(e.target.value)}>
                  <option value="">All types</option>
                  {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Vendor</label>
                <select value={orderVendorFilter} onChange={(e) => setOrderVendorFilter(e.target.value)}>
                  <option value="">All vendors</option>
                  {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Thickness</label>
                <select value={orderThicknessFilter} onChange={(e) => setOrderThicknessFilter(e.target.value)}>
                  <option value="">All thicknesses</option>
                  <option>2cm</option>
                  <option>3cm</option>
                  <option>1.2cm</option>
                  <option>Other</option>
                </select>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { setOrderColorFilter(""); setOrderMaterialTypeFilter(""); setOrderVendorFilter(""); setOrderThicknessFilter(""); }}
              >
                Clear
              </button>
            </div>
          )}

          {ordersFiltered.length === 0 ? (
            <div className="empty">
              <h3>No material orders here</h3>
              <p>Use "Order Materials" to log a shipment you're waiting on.</p>
            </div>
          ) : (
            <div className="order-list">
              {ordersFiltered.map((o) => {
                const overdue = o.status === "ordered" && o.expectedDate && daysBetween(todayStr(), o.expectedDate) < 0;
                return (
                  <div className="order-card" key={o.id}>
                    <div className="order-card-top">
                      <div>
                        <div className="order-name">{o.materialName}{o.color ? ` — ${o.color}` : ""}</div>
                        <div className="order-sub">
                          {o.materialType ? `${o.materialType} · ` : ""}{o.vendor || "No vendor set"} · Qty {o.quantity || 1} · {o.thickness} · {o.owner}
                          {o.lengthIn && o.widthIn ? ` · ${o.lengthIn}"×${o.widthIn}" (${sqftOf(o.lengthIn, o.widthIn).toFixed(1)} sqft ea.)` : ""}
                        </div>
                      </div>
                      <span className={`badge ${overdue ? "badge-missing" : `badge-order-${o.status}`}`}>{o.status === "ordered" ? (overdue ? "Overdue" : "On Order") : o.status === "received" ? "Received" : "Cancelled"}</span>
                    </div>
                    {(o.jobName || o.salesOrderNumber) && (
                      <div className="job-tag" style={{ alignSelf: "flex-start" }}>
                        <BadgeCheck size={13} /> {o.jobName || "General stock"}{o.salesOrderNumber ? ` · SO #${o.salesOrderNumber}` : ""}
                      </div>
                    )}
                    <div className="order-dates mono">
                      Ordered {o.orderDate || "—"}
                      {o.expectedDate ? ` · Expected ${o.expectedDate}` : ""}
                      {o.status === "received" && o.receivedDate ? ` · Received ${o.receivedDate}` : ""}
                    </div>
                    {o.notes && <div className="order-notes">{o.notes}</div>}
                    <div className="action-row">
                      {o.status === "ordered" && (
                        <button className="btn btn-primary btn-sm" onClick={() => receiveOrder(o)}><PackageCheck size={14} /> Receive Into Inventory</button>
                      )}
                      {o.status === "ordered" && (
                        <button className="btn btn-outline btn-sm" onClick={() => openEditOrder(o)}>Edit</button>
                      )}
                      {o.status === "ordered" && (
                        <button className="btn btn-outline btn-sm" onClick={() => setConfirmCancelOrder(o)}>Cancel Order</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteOrder(o)}><Trash2 size={14} /> Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADD BUILDER MODAL */}
      {addBuilderOpen && (
        <div className="overlay" onClick={() => setAddBuilderOpen(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add a builder</h2>
              <button className="icon-btn" onClick={() => setAddBuilderOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Builder name</label>
                <input autoFocus value={newBuilderName} onChange={(e) => setNewBuilderName(e.target.value)} placeholder="e.g. Hartwell Homes" onKeyDown={(e) => e.key === "Enter" && addBuilder()} />
              </div>
              <p style={{ fontSize: 12.5, color: "#3a4340", margin: 0 }}>This creates a separate inventory tab for slabs this builder owns and stores at your shop.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setAddBuilderOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={addBuilder}>Add builder</button>
            </div>
          </div>
        </div>
      )}

      {/* REMOVE BUILDER CONFIRM */}
      {confirmDeleteBuilder && (() => {
        const affectedCount = slabs.filter((s) => s.owner === confirmDeleteBuilder).length;
        return (
          <div className="overlay" onClick={() => setConfirmDeleteBuilder(null)}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Remove {confirmDeleteBuilder}?</h2>
                <button className="icon-btn" onClick={() => setConfirmDeleteBuilder(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0, fontSize: 13.5 }}>
                  This removes {confirmDeleteBuilder}'s tab.
                  {affectedCount > 0
                    ? ` ${affectedCount} slab${affectedCount === 1 ? "" : "s"} currently owned by them will move back to Shop stock rather than being deleted.`
                    : " No slabs are currently assigned to them."}
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline btn-block" onClick={() => setConfirmDeleteBuilder(null)}>Cancel</button>
                <button className="btn btn-danger btn-block" onClick={() => deleteBuilder(confirmDeleteBuilder)}>Remove</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD VENDOR MODAL */}
      {addVendorOpen && (
        <div className="overlay" onClick={() => setAddVendorOpen(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add a vendor</h2>
              <button className="icon-btn" onClick={() => setAddVendorOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Vendor name</label>
                <input autoFocus value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} placeholder="e.g. MSI" onKeyDown={(e) => e.key === "Enter" && addVendor()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setAddVendorOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={addVendor}>Add vendor</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SALES REP MODAL */}
      {addSalesRepOpen && (
        <div className="overlay" onClick={() => setAddSalesRepOpen(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add a sales rep</h2>
              <button className="icon-btn" onClick={() => setAddSalesRepOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Sales rep name</label>
                <input autoFocus value={newSalesRepName} onChange={(e) => setNewSalesRepName(e.target.value)} placeholder="e.g. Jamie Rivera" onKeyDown={(e) => e.key === "Enter" && addSalesRep()} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setAddSalesRepOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={addSalesRep}>Add sales rep</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT SLAB MODAL */}
      {formOpen && (
        <div className="overlay" onClick={() => setFormOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? "Edit slab" : "Add a slab"}</h2>
              <button className="icon-btn" onClick={() => setFormOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="row-2">
                <div className="field">
                  <label>Material / slab name</label>
                  <input value={form.materialName} onChange={(e) => setForm({ ...form, materialName: e.target.value })} placeholder="e.g. Calacatta Gold" />
                </div>
                <div className="field">
                  <label>Color</label>
                  <input list="color-options" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. White" />
                </div>
              </div>
              <div className="field">
                <label>Material type</label>
                <select value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })}>
                  <option value="">Not set</option>
                  {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="kind-toggle">
                <button type="button" className={form.kind === "slab" ? "active" : ""} onClick={() => setForm({ ...form, kind: "slab" })}>Standard slab</button>
                <button type="button" className={form.kind === "remnant" ? "active" : ""} onClick={() => setForm({ ...form, kind: "remnant" })}>Remnant / irregular piece</button>
              </div>

              {form.kind === "slab" ? (
                <div className="row-3">
                  <div className="field">
                    <label>Length (in)</label>
                    <input type="number" value={form.lengthIn} onChange={(e) => setForm({ ...form, lengthIn: e.target.value })} placeholder="126" />
                  </div>
                  <div className="field">
                    <label>Width (in)</label>
                    <input type="number" value={form.widthIn} onChange={(e) => setForm({ ...form, widthIn: e.target.value })} placeholder="63" />
                  </div>
                  <div className="field">
                    <label>Thickness</label>
                    <select value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}>
                      <option>2cm</option>
                      <option>3cm</option>
                      <option>1.2cm</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="row-2">
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>Usable shape</label>
                    {form.shape && form.shape.points.length >= 3 ? (
                      <div className="shape-mini">
                        <ShapeSVG shape={form.shape} interactive={false} height={140} />
                        <button type="button" className="btn btn-outline btn-sm" onClick={openShapeEditor}>Redraw shape</button>
                      </div>
                    ) : (
                      <button type="button" className="btn btn-outline btn-block" onClick={openShapeEditor}>Draw the usable shape</button>
                    )}
                  </div>
                  <div className="field">
                    <label>Thickness</label>
                    <select value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}>
                      <option>2cm</option>
                      <option>3cm</option>
                      <option>1.2cm</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
              )}

              {currentSqft > 0 && <div className="sqft-pill">{currentSqft.toFixed(2)} sq ft</div>}

              <div className="row-2">
                <div className="field">
                  <label>Lot #</label>
                  <input value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} placeholder="LOT-2291" />
                </div>
                <div className="field">
                  <label>Vendor</label>
                  <select
                    value={form.vendor}
                    onChange={(e) => {
                      if (e.target.value === "__add__") setAddVendorOpen(true);
                      else setForm({ ...form, vendor: e.target.value });
                    }}
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                    <option value="__add__">+ Add new vendor…</option>
                  </select>
                </div>
              </div>

              <div className="row-2">
                <div className="field">
                  <label>Date received</label>
                  <input type="date" value={form.dateReceived} onChange={(e) => setForm({ ...form, dateReceived: e.target.value })} />
                </div>
                <div className="field">
                  <label>Owner</label>
                  <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                    <option value="Shop">Shop</option>
                    {builders.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div className="cost-toggle" onClick={() => setShowCostFields((v) => !v)}>
                <span>{showCostFields ? <Eye size={15} /> : <EyeOff size={15} />} Cost & fees (hidden from customer view)</span>
                <ChevronDown size={16} style={{ transform: showCostFields ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </div>
              {showCostFields && (
                <div className="pricing-box">
                  <div className="kind-toggle">
                    <button type="button" className={baseCostMode !== "persqft" ? "active" : ""} onClick={() => setBaseCostModeTo("total")}>Total $ for slab</button>
                    <button type="button" className={baseCostMode === "persqft" ? "active" : ""} onClick={() => setBaseCostModeTo("persqft")}>$ per sqft</button>
                  </div>
                  {baseCostMode === "persqft" ? (
                    <div className="field">
                      <label>Base material cost ($/sqft)</label>
                      <input type="number" value={baseCostRate} onChange={(e) => handleBaseCostRateChange(e.target.value)} placeholder="0.00" />
                      {currentSqft > 0 && <div className="sqft-pill">= {money(form.baseCost || 0)} total ({currentSqft.toFixed(2)} sqft)</div>}
                    </div>
                  ) : (
                    <div className="field">
                      <label>Base material cost ($ total)</label>
                      <input type="number" value={form.baseCost} onChange={(e) => setForm({ ...form, baseCost: e.target.value })} placeholder="0.00" />
                    </div>
                  )}
                  <div className="row-2">
                    <div className="field">
                      <label>Delivery fee</label>
                      <div className="fee-input">
                        <input type="number" value={form.feeValue} onChange={(e) => setForm({ ...form, feeValue: e.target.value })} placeholder="0" />
                        <select value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })}>
                          <option value="flat">$ total</option>
                          <option value="percent">% of cost</option>
                          <option value="persqft">$/sqft</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Surcharge</label>
                      <div className="fee-input">
                        <input type="number" value={form.surchargeValue} onChange={(e) => setForm({ ...form, surchargeValue: e.target.value })} placeholder="0" />
                        <select value={form.surchargeType} onChange={(e) => setForm({ ...form, surchargeType: e.target.value })}>
                          <option value="flat">$ total</option>
                          <option value="percent">% of cost</option>
                          <option value="persqft">$/sqft</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {currentSqft > 0 && (
                    <div className="cost-breakdown">
                      <div className="hint">Cost per sq ft, split out by source (based on this slab's {currentSqft.toFixed(2)} sq ft):</div>
                      <div className="cost-breakdown-row"><span>Base material</span><span>{money(formCostPerSqft.base)}/sqft</span></div>
                      <div className="cost-breakdown-row"><span>Delivery fee</span><span>{money(formCostPerSqft.delivery)}/sqft</span></div>
                      <div className="cost-breakdown-row"><span>Surcharge</span><span>{money(formCostPerSqft.surcharge)}/sqft</span></div>
                      <div className="cost-breakdown-row total"><span>Total cost</span><span>{money(formCostPerSqft.total)}/sqft</span></div>
                    </div>
                  )}
                  <div className="margin-line" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                    <span>Total cost</span>
                    <span>{money(formPricing.totalCost)}</span>
                  </div>
                </div>
              )}

              <div className="pricing-box">
                <div className="hint">Wholesale (26% margin) and retail (40% margin) are calculated from total cost. Check "set manually" to override.</div>
                <div className="row-2">
                  <div className="field">
                    <label>Wholesale price</label>
                    <input
                      type="number"
                      value={form.useManualWholesale ? form.wholesaleManual : formPricing.wholesaleCalc.toFixed(2)}
                      disabled={!form.useManualWholesale}
                      onChange={(e) => setForm({ ...form, wholesaleManual: e.target.value })}
                    />
                    <label className="checkbox-label">
                      <input type="checkbox" checked={form.useManualWholesale} onChange={(e) => setForm({ ...form, useManualWholesale: e.target.checked, wholesaleManual: e.target.checked ? formPricing.wholesaleCalc.toFixed(2) : form.wholesaleManual })} />
                      Set manually
                    </label>
                  </div>
                  <div className="field">
                    <label>Retail price</label>
                    <input
                      type="number"
                      value={form.useManualRetail ? form.retailManual : formPricing.retailCalc.toFixed(2)}
                      disabled={!form.useManualRetail}
                      onChange={(e) => setForm({ ...form, retailManual: e.target.value })}
                    />
                    <label className="checkbox-label">
                      <input type="checkbox" checked={form.useManualRetail} onChange={(e) => setForm({ ...form, useManualRetail: e.target.checked, retailManual: e.target.checked ? formPricing.retailCalc.toFixed(2) : form.retailManual })} />
                      Set manually
                    </label>
                  </div>
                </div>
                {currentSqft > 0 && (
                  <div className="margin-line">
                    <span>{money(formPricing.wholesale / currentSqft || 0)}/sqft wholesale</span>
                    <span>{money(formPricing.retail / currentSqft || 0)}/sqft retail</span>
                  </div>
                )}
                {showCostFields && formPricing.totalCost > 0 && (
                  <div className="margin-line">
                    <span>Wholesale margin: {money(formPricing.wholesale - formPricing.totalCost)}</span>
                    <span>Retail margin: {money(formPricing.retail - formPricing.totalCost)}</span>
                  </div>
                )}
              </div>

              <div className="field">
                <label>Photo</label>
                {photoDataUrl ? (
                  <div className="photo-preview">
                    <img src={photoDataUrl} alt="Slab" />
                    <button type="button" className="btn btn-outline btn-sm" onClick={removePhoto}><Trash2 size={13} /> Remove photo</button>
                  </div>
                ) : (
                  <label className="photo-upload">
                    {photoUploading ? "Processing…" : "Click to upload a photo"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handlePhotoFile(e.target.files[0])} />
                  </label>
                )}
              </div>

              <div className="field">
                <label>Or link to view the slab (photo, spec sheet, etc.)</label>
                <input value={form.photoLink} onChange={(e) => setForm({ ...form, photoLink: e.target.value })} placeholder="https://..." />
              </div>

              <div className="row-2">
                <div className="field">
                  <label>Sales order #</label>
                  <input value={form.salesOrderNumber} onChange={(e) => setForm({ ...form, salesOrderNumber: e.target.value })} placeholder="Optional" />
                </div>
                <div className="field">
                  <label>Invoice #</label>
                  <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Optional" />
                </div>
              </div>

              <div className="field">
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn btn-outline btn-block" onClick={() => saveSlab({ print: true })}><Printer size={16} /> Save & Print</button>
              <button className="btn btn-primary btn-block" onClick={() => saveSlab()}><Check size={16} /> {editingId ? "Save changes" : "Add slab"}</button>
            </div>
          </div>
        </div>
      )}

      {/* RESERVE MODAL */}
      {reserveTarget && (
        <div className="overlay" onClick={() => setReserveTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reserve slab</h2>
              <button className="icon-btn" onClick={() => setReserveTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13.5 }}><b>{reserveTarget.materialName}</b> — {reserveTarget.lengthIn}"×{reserveTarget.widthIn}" · Lot {reserveTarget.lotNumber || "—"}</p>
              <div className="field">
                <label>Job / project name</label>
                <input autoFocus value={reserveJob} onChange={(e) => setReserveJob(e.target.value)} placeholder="e.g. Miller Kitchen Remodel" />
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Customer name</label>
                  <input value={reserveCustomer} onChange={(e) => setReserveCustomer(e.target.value)} placeholder="e.g. John Miller" />
                </div>
                <div className="field">
                  <label>Job #</label>
                  <input value={reserveJobNumber} onChange={(e) => setReserveJobNumber(e.target.value)} placeholder="e.g. 4471" />
                </div>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Hold expires</label>
                  <input type="date" value={reserveHoldExpires} onChange={(e) => setReserveHoldExpires(e.target.value)} />
                </div>
                <div className="field">
                  <label>Sales rep</label>
                  <select
                    value={reserveSalesRep}
                    onChange={(e) => {
                      if (e.target.value === "__add__") setAddSalesRepOpen(true);
                      else setReserveSalesRep(e.target.value);
                    }}
                  >
                    <option value="">None</option>
                    {salesReps.map((r) => <option key={r} value={r}>{r}</option>)}
                    <option value="__add__">+ Add new sales rep…</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Belongs to</label>
                <select value={reserveOwner} onChange={(e) => setReserveOwner(e.target.value)}>
                  <option value="Shop">Shop</option>
                  {builders.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setReserveTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={confirmReserve}>Reserve</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailSlab && (() => {
        const s = slabs.find((x) => x.id === detailSlab.id) || detailSlab;
        const sf = getSqft(s);
        const { retail, wholesale, totalCost } = getPricing(s);
        const costPerSqft = getCostPerSqft(s);
        const retailPpsf = sf > 0 && retail ? retail / sf : 0;
        const wholesalePpsf = sf > 0 && wholesale ? wholesale / sf : 0;
        return (
          <div className="overlay" onClick={() => setDetailSlab(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{s.materialName}{s.color ? ` — ${s.color}` : ""}</h2>
                <button className="icon-btn" onClick={() => setDetailSlab(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <div className="detail-status-row">
                  <span className={`badge badge-${s.status === STATUS.STOCK ? "stock" : s.status === STATUS.RESERVED ? "reserved" : "cut"}`}>{STATUS_LABEL[s.status]}</span>
                  <span className="mono" style={{ fontSize: 12, color: "#3a4340" }}>{s.owner}</span>
                </div>

                {s.flaggedMissing && (
                  <div className="missing-note">
                    <ShieldAlert size={14} /> Not scanned during the last inventory check — verify where this slab ended up.
                    <button className="btn btn-outline btn-sm" onClick={() => clearMissingFlag(s)}>Mark as located</button>
                  </div>
                )}

                {s.pulledForFab && (
                  <div className="pulled-note">
                    <Wrench size={14} /> Pulled for fabrication{s.pulledDate ? ` on ${s.pulledDate}` : ""}{s.pulledBy ? ` by ${s.pulledBy}` : ""} — not yet marked cut & used.
                    <button className="btn btn-outline btn-sm" onClick={() => returnToYard(s)}>Return to Yard</button>
                  </div>
                )}

                {s.kind === "remnant" && s.shape && s.shape.points.length >= 3 && (
                  <ShapeSVG shape={s.shape} interactive={false} height={220} />
                )}

                {(detailPhotoLoading || detailPhotoUrl || s.photoLink) && (
                  <div className="detail-photo-block">
                    {detailPhotoLoading && <div className="hint">Loading photo…</div>}
                    {detailPhotoUrl && <img src={detailPhotoUrl} alt={s.materialName} className="detail-photo" />}
                    {s.photoLink && (
                      <a href={s.photoLink} target="_blank" rel="noopener noreferrer" className="photo-link">View linked photo / spec sheet →</a>
                    )}
                  </div>
                )}

                {(s.jobName || s.customerName || s.jobNumber) && (
                  <div className="job-tag" style={{ alignSelf: "flex-start" }}>
                    <BadgeCheck size={13} /> <b>{s.jobName || "Reserved"}</b>{s.customerName ? ` · ${s.customerName}` : ""}{s.jobNumber ? ` · #${s.jobNumber}` : ""}
                  </div>
                )}

                {s.status === STATUS.RESERVED && (() => {
                  const hi = holdInfo(s);
                  return (
                    <div className={`hold-box ${hi && hi.expired ? "expired" : ""}`}>
                      <div className="hold-box-row">
                        <CalendarClock size={14} />
                        {s.holdExpires ? (
                          hi.expired ? <span>Hold expired on {s.holdExpires} ({Math.abs(hi.daysLeft)} day{Math.abs(hi.daysLeft) === 1 ? "" : "s"} ago)</span>
                          : <span>Hold expires {s.holdExpires} ({hi.daysLeft} day{hi.daysLeft === 1 ? "" : "s"} left)</span>
                        ) : <span>No hold expiration set</span>}
                      </div>
                      {s.salesRep && <div className="hold-box-row">Held by: <b>{s.salesRep}</b></div>}
                      <div className="action-row">
                        <button className="btn btn-outline btn-sm" onClick={() => setHoldLabelSlab(s)}><Printer size={14} /> Print Hold Label</button>
                        <button className="btn btn-outline btn-sm" onClick={() => releaseHold(s)}><Undo2 size={14} /> Release Hold</button>
                      </div>
                    </div>
                  );
                })()}

                <div className="detail-grid">
                  <div className="detail-item"><div className="meta-label">Size</div><div className="meta-val">{s.kind === "remnant" ? "Irregular (drawn shape)" : `${s.lengthIn}" × ${s.widthIn}"`}</div></div>
                  <div className="detail-item"><div className="meta-label">Sq Ft</div><div className="meta-val">{sf ? sf.toFixed(2) : "—"}</div></div>
                  <div className="detail-item"><div className="meta-label">Thickness</div><div className="meta-val">{s.thickness}</div></div>
                  <div className="detail-item"><div className="meta-label">Lot #</div><div className="meta-val">{s.lotNumber || "—"}</div></div>
                  <div className="detail-item"><div className="meta-label">Vendor</div><div className="meta-val">{s.vendor || "—"}</div></div>
                  <div className="detail-item"><div className="meta-label">Date received</div><div className="meta-val">{s.dateReceived || "—"}</div></div>
                </div>

                <div className="detail-grid">
                  <div className="detail-item"><div className="meta-label">Retail price</div><div className="meta-val">{retail ? money(retail) : "—"}{retailPpsf ? ` (${money(retailPpsf)}/sqft)` : ""}</div></div>
                  <div className="detail-item"><div className="meta-label">Wholesale price</div><div className="meta-val">{wholesale ? money(wholesale) : "—"}{wholesalePpsf ? ` (${money(wholesalePpsf)}/sqft)` : ""}</div></div>
                </div>

                {showCosts ? (
                  <>
                    <div className="detail-grid">
                      <div className="detail-item"><div className="meta-label">Total cost</div><div className="meta-val">{totalCost ? money(totalCost) : "—"}</div></div>
                      <div className="detail-item"><div className="meta-label">Base cost</div><div className="meta-val">{s.baseCost ? money(s.baseCost) : "—"}</div></div>
                      <div className="detail-item"><div className="meta-label">Wholesale margin</div><div className="meta-val">{totalCost ? money(wholesale - totalCost) : "—"}</div></div>
                      <div className="detail-item"><div className="meta-label">Retail margin</div><div className="meta-val">{totalCost ? money(retail - totalCost) : "—"}</div></div>
                    </div>
                    {sf > 0 && (
                      <div className="cost-breakdown">
                        <div className="hint">Cost per sq ft, split out by source:</div>
                        <div className="cost-breakdown-row"><span>Base material</span><span>{money(costPerSqft.base)}/sqft</span></div>
                        <div className="cost-breakdown-row"><span>Delivery fee</span><span>{money(costPerSqft.delivery)}/sqft</span></div>
                        <div className="cost-breakdown-row"><span>Surcharge</span><span>{money(costPerSqft.surcharge)}/sqft</span></div>
                        <div className="cost-breakdown-row total"><span>Total cost</span><span>{money(costPerSqft.total)}/sqft</span></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cost-reveal-note">Cost and margins are hidden. Turn on "Costs Visible" in the top bar to view them.</div>
                )}

                {(s.salesOrderNumber || s.invoiceNumber) && (
                  <div className="detail-grid">
                    <div className="detail-item"><div className="meta-label">Sales order #</div><div className="meta-val">{s.salesOrderNumber || "—"}</div></div>
                    <div className="detail-item"><div className="meta-label">Invoice #</div><div className="meta-val">{s.invoiceNumber || "—"}</div></div>
                  </div>
                )}

                {s.notes && (
                  <div className="detail-item">
                    <div className="meta-label">Notes</div>
                    <div style={{ fontSize: 13 }}>{s.notes}</div>
                  </div>
                )}

                <hr className="divider" />

                <div className="action-row">
                  {s.status === STATUS.STOCK && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => openReserve(s)}><BadgeCheck size={14} /> Reserve</button>
                      <button className="btn btn-outline btn-sm" onClick={() => markCut(s)}><Scissors size={14} /> Mark cut & used</button>
                    </>
                  )}
                  {s.status === STATUS.RESERVED && (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => markCut(s)}><Scissors size={14} /> Mark cut & used</button>
                      <button className="btn btn-outline btn-sm" onClick={() => releaseHold(s)}><Undo2 size={14} /> Release hold</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openReserve(s)}>Edit reservation</button>
                    </>
                  )}
                  {s.status === STATUS.CUT && (
                    <button className="btn btn-outline btn-sm" onClick={() => returnToStock(s)}><Undo2 size={14} /> Undo — return to stock</button>
                  )}
                  {s.status !== STATUS.CUT && (
                    s.pulledForFab ? (
                      <button className="btn btn-outline btn-sm" onClick={() => returnToYard(s)}><Undo2 size={14} /> Return to Yard</button>
                    ) : (
                      <button className="btn btn-outline btn-sm" onClick={() => markPulledForFab(s)}><Wrench size={14} /> Pulled for Fabrication</button>
                    )
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => setLabelSlab(s)}><Printer size={14} /> Print label</button>
                  <button className="btn btn-outline btn-sm" onClick={() => duplicateSlab(s)}><Copy size={14} /> Duplicate</button>
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>Edit details</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(s)}><Trash2 size={14} /> Delete</button>
                </div>

                <hr className="divider" />

                <div className="documents-header">
                  <div className="meta-label">Documents</div>
                  <button className="btn btn-outline btn-sm" onClick={() => openDocModal(s)}><Plus size={13} /> Add document</button>
                </div>
                {s.documents && s.documents.length > 0 ? (
                  <div className="doc-list">
                    {s.documents.map((d) => (
                      <div className="doc-item" key={d.id}>
                        <span className={`badge badge-doc-${d.docType}`}>
                          {d.docType === "invoice" ? "Invoice" : d.docType === "sales_order" ? "Sales Order" : "Other"}
                        </span>
                        <div className="doc-info">
                          <div className="doc-name">{d.fileName}{d.refNumber ? ` · #${d.refNumber}` : ""}</div>
                          <div className="doc-date">{d.date}</div>
                        </div>
                        <div className="doc-actions">
                          <button className="icon-btn" title="View PDF" disabled={docViewingId === d.id} onClick={() => viewDocument(s.id, d.id)}><FileText size={15} /></button>
                          <button className="icon-btn" title="Delete" onClick={() => deleteDocument(s.id, d.id)}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>No documents attached yet.</p>
                )}

                {s.history && s.history.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div className="meta-label">History</div>
                    <div className="history-list">
                      {s.history.map((h, i) => (
                        <div className="history-item" key={i}><span>{h.event}</span><span>{h.date}</span></div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* SHAPE DRAWING MODAL */}
      {shapeModalOpen && shapeDraft && (
        <div className="overlay" onClick={() => setShapeModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Draw usable shape</h2>
              <button className="icon-btn" onClick={() => setShapeModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ margin: 0 }}>Click to place each corner in order, snapping to the grid. Add at least 3 points to form the shape. Click any edge's number to type an exact measurement.</p>
              <div className="row-3">
                <div className="field">
                  <label>Grid size (in)</label>
                  <input type="number" value={shapeDraft.gridSize} onChange={(e) => setShapeDraft((d) => ({ ...d, gridSize: parseFloat(e.target.value) || 1 }))} />
                </div>
                <div className="field">
                  <label>Canvas width (in)</label>
                  <input type="number" value={shapeDraft.maxWidth} onChange={(e) => setShapeDraft((d) => ({ ...d, maxWidth: parseFloat(e.target.value) || 1 }))} />
                </div>
                <div className="field">
                  <label>Canvas height (in)</label>
                  <input type="number" value={shapeDraft.maxHeight} onChange={(e) => setShapeDraft((d) => ({ ...d, maxHeight: parseFloat(e.target.value) || 1 }))} />
                </div>
              </div>

              <ShapeSVG shape={shapeDraft} interactive onCanvasClick={addShapePoint} onEdgeLengthChange={updateEdgeLength} height={300} />

              <div className="shape-readout">
                <span>{shapeDraft.points.length} point{shapeDraft.points.length === 1 ? "" : "s"}</span>
                <span>{shapeDraft.points.length >= 3 ? `${(polygonAreaIn2(shapeDraft.points) / 144).toFixed(2)} sq ft` : "add more points"}</span>
              </div>

              <div className="action-row">
                <button type="button" className="btn btn-outline btn-sm" onClick={undoShapePoint} disabled={!shapeDraft.points.length}>Undo last point</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={clearShapePoints} disabled={!shapeDraft.points.length}>Clear all</button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setShapeModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={saveShape} disabled={shapeDraft.points.length < 3}>Save shape</button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT LABEL MODAL */}
      {labelSlab && (
        <div className="overlay" onClick={() => setLabelSlab(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print">
              <h2>Print label</h2>
              <button className="icon-btn" onClick={() => setLabelSlab(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="label-sheet print-target">
                <div className="label-material">{labelSlab.materialName}{labelSlab.kind === "remnant" ? " (Remnant)" : ""}</div>
                {labelSlab.kind === "remnant" ? (
                  <>
                    <div className="label-line">{getSqft(labelSlab).toFixed(1)} sq ft usable · {labelSlab.thickness}</div>
                    {labelSlab.shape && labelSlab.shape.points.length >= 3 && (
                      <ShapeSVG shape={labelSlab.shape} interactive={false} height={150} />
                    )}
                  </>
                ) : (
                  <div className="label-line">{labelSlab.lengthIn}" × {labelSlab.widthIn}" · {labelSlab.thickness}</div>
                )}
                <div className="label-line">Lot {labelSlab.lotNumber || "—"} · {labelSlab.owner}</div>
                <div className="label-codes">
                  <div ref={qrCodeRef} className="label-qr" />
                  {barcodeError ? (
                    <div className="cost-reveal-note" style={{ marginTop: 8 }}>Couldn't load the barcode renderer — check your connection and reopen this label.</div>
                  ) : (
                    <canvas ref={barcodeCanvasRef} />
                  )}
                </div>
              </div>
              <p className="hint no-print" style={{ marginTop: 4 }}>Scan the QR code with a phone camera, or the barcode with a USB/Bluetooth scanner or the scan box at the top of the page.</p>
            </div>
            <div className="modal-footer no-print">
              <button className="btn btn-outline btn-block" onClick={() => setLabelSlab(null)}>Close</button>
              <button className="btn btn-primary btn-block" onClick={printLabel}><Printer size={16} /> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* HOLD LABEL MODAL */}
      {holdLabelSlab && (() => {
        const hi = holdInfo(holdLabelSlab);
        return (
          <div className="overlay" onClick={() => setHoldLabelSlab(null)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header no-print">
                <h2>Print hold label</h2>
                <button className="icon-btn" onClick={() => setHoldLabelSlab(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <div className="label-sheet hold-label-sheet print-target">
                  <div className="hold-label-banner">ON HOLD</div>
                  <div className="label-material">{holdLabelSlab.materialName}{holdLabelSlab.kind === "remnant" ? " (Remnant)" : ""}</div>
                  <div className="label-line">
                    {holdLabelSlab.kind === "remnant" ? `${getSqft(holdLabelSlab).toFixed(1)} sq ft` : `${holdLabelSlab.lengthIn}" × ${holdLabelSlab.widthIn}"`}
                    {" · "}{holdLabelSlab.thickness} · Lot {holdLabelSlab.lotNumber || "—"}
                  </div>
                  <div className="hold-label-divider" />
                  <div className="label-line hold-label-strong">Job: {holdLabelSlab.jobName || "—"}</div>
                  <div className="label-line hold-label-strong">Customer: {holdLabelSlab.customerName || "—"}</div>
                  {holdLabelSlab.jobNumber && <div className="label-line">Job #: {holdLabelSlab.jobNumber}</div>}
                  {holdLabelSlab.salesOrderNumber && <div className="label-line">Sales order #: {holdLabelSlab.salesOrderNumber}</div>}
                  {holdLabelSlab.salesRep && <div className="label-line">Held by: {holdLabelSlab.salesRep}</div>}
                  <div className={`label-line hold-label-expiry ${hi && hi.expired ? "expired" : ""}`}>
                    {holdLabelSlab.holdExpires
                      ? (hi.expired ? `Hold expired ${holdLabelSlab.holdExpires}` : `Hold expires ${holdLabelSlab.holdExpires}`)
                      : "No expiration set"}
                  </div>
                  <div className="label-codes">
                    <div ref={holdQrCodeRef} className="label-qr" />
                    {barcodeError ? (
                      <div className="cost-reveal-note" style={{ marginTop: 8 }}>Couldn't load the barcode renderer — check your connection and reopen this label.</div>
                    ) : (
                      <canvas ref={holdBarcodeCanvasRef} />
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer no-print">
                <button className="btn btn-outline btn-block" onClick={() => setHoldLabelSlab(null)}>Close</button>
                <button className="btn btn-primary btn-block" onClick={printLabel}><Printer size={16} /> Print</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* BATCH LABEL PRINT MODAL (from Fast Add) */}
      {labelQueue && (
        <div className="overlay" onClick={() => setLabelQueue(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print">
              <h2>Print {labelQueue.length} label{labelQueue.length === 1 ? "" : "s"}</h2>
              <button className="icon-btn" onClick={() => setLabelQueue(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="hint no-print" style={{ margin: 0 }}>Each slab prints on its own label — set your printer to one label/sticker per page if that's what you use.</p>
              <div className="batch-label-wrap print-target">
                {labelQueue.map((slab) => (
                  <div className="label-sheet batch-label-sheet" key={slab.id}>
                    <div className="label-material">{slab.materialName}</div>
                    <div className="label-line">{slab.lengthIn}" × {slab.widthIn}" · {slab.thickness}</div>
                    <div className="label-line">Lot {slab.lotNumber || "—"} · {slab.owner}</div>
                    <div className="label-codes">
                      <div ref={(el) => labelQueueQRs.current.set(slab.id, el)} className="label-qr" />
                      <canvas ref={(el) => labelQueueCanvases.current.set(slab.id, el)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer no-print">
              <button className="btn btn-outline btn-block" onClick={() => setLabelQueue(null)}>Close</button>
              <button className="btn btn-primary btn-block" onClick={printLabel}><Printer size={16} /> Print all</button>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA SCAN MODAL */}
      {cameraOpen && (
        <div className="overlay" onClick={closeCameraScan}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Scan with camera</h2>
              <button className="icon-btn" onClick={closeCameraScan}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {cameraError ? (
                <div className="cost-reveal-note">{cameraError}</div>
              ) : (
                <>
                  <video ref={videoRef} className="camera-video" muted playsInline />
                  <p className="hint" style={{ margin: 0 }}>
                    Point your camera at a slab's QR code or barcode.
                    {auditActive ? " Scanning continues automatically during your inventory check." : ""}
                  </p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={closeCameraScan}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* SCAN RESULT MODAL */}
      {scanResultSlab && (() => {
        const s = slabs.find((x) => x.id === scanResultSlab.id) || scanResultSlab;
        return (
          <div className="overlay" onClick={() => setScanResultSlab(null)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{s.materialName}{s.color ? ` — ${s.color}` : ""}</h2>
                <button className="icon-btn" onClick={() => setScanResultSlab(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <span className={`badge badge-${s.status === STATUS.STOCK ? "stock" : s.status === STATUS.RESERVED ? "reserved" : "cut"}`} style={{ alignSelf: "flex-start" }}>
                  {STATUS_LABEL[s.status]}
                </span>
                <p style={{ margin: 0, fontSize: 13.5 }}>{s.lengthIn}" × {s.widthIn}" · {s.thickness} · Lot {s.lotNumber || "—"} · {s.owner}</p>
                {s.pulledForFab && (
                  <div className="job-tag pulled-tag" style={{ alignSelf: "flex-start" }}>
                    <Wrench size={13} /> Pulled for fabrication{s.pulledDate ? ` on ${s.pulledDate}` : ""}{s.pulledBy ? ` by ${s.pulledBy}` : ""}
                  </div>
                )}
                {(s.jobName || s.customerName || s.jobNumber) && <div className="job-tag" style={{ alignSelf: "flex-start" }}><BadgeCheck size={13} /> <b>{s.jobName || "Reserved"}</b>{s.customerName ? ` · ${s.customerName}` : ""}{s.jobNumber ? ` · #${s.jobNumber}` : ""}</div>}
                <div className="action-row">
                  {s.status === STATUS.STOCK && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => { setScanResultSlab(null); openReserve(s); }}><BadgeCheck size={14} /> Reserve</button>
                      <button className="btn btn-outline btn-sm" onClick={() => { markCut(s); setScanResultSlab(null); }}><Scissors size={14} /> Mark cut & used</button>
                    </>
                  )}
                  {s.status === STATUS.RESERVED && (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => { markCut(s); setScanResultSlab(null); }}><Scissors size={14} /> Mark cut & used</button>
                      <button className="btn btn-outline btn-sm" onClick={() => { releaseHold(s); setScanResultSlab(null); }}><Undo2 size={14} /> Release hold</button>
                    </>
                  )}
                  {s.status === STATUS.CUT && (
                    <button className="btn btn-outline btn-sm" onClick={() => { returnToStock(s); setScanResultSlab(null); }}><Undo2 size={14} /> Undo — return to stock</button>
                  )}
                  {s.status !== STATUS.CUT && (
                    s.pulledForFab ? (
                      <button className="btn btn-outline btn-sm" onClick={() => { returnToYard(s); setScanResultSlab(null); }}><Undo2 size={14} /> Return to Yard</button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => { markPulledForFab(s); setScanResultSlab(null); }}><Wrench size={14} /> Pulled for Fabrication</button>
                    )
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => { setScanResultSlab(null); setDetailSlab(s); }}>View full details</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD DOCUMENT MODAL */}
      {docModalSlab && (
        <div className="overlay" onClick={() => setDocModalSlab(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add document</h2>
              <button className="icon-btn" onClick={() => setDocModalSlab(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13.5 }}><b>{docModalSlab.materialName}</b> — Lot {docModalSlab.lotNumber || "—"}</p>
              <div className="field">
                <label>Document type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="invoice">Invoice</option>
                  <option value="sales_order">Sales Order</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label>{docType === "invoice" ? "Invoice #" : docType === "sales_order" ? "Sales order #" : "Reference #"}</label>
                <input value={docRefNumber} onChange={(e) => setDocRefNumber(e.target.value)} placeholder="Optional" />
              </div>
              <div className="field">
                <label>PDF file</label>
                {docFile ? (
                  <div className="photo-preview">
                    <div className="job-tag"><FileText size={13} /> {docFile.fileName}</div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setDocFile(null)}><Trash2 size={13} /> Remove</button>
                  </div>
                ) : (
                  <label className="photo-upload">
                    {docUploading ? "Processing…" : "Click to upload a PDF"}
                    <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => handleDocFile(e.target.files[0])} />
                  </label>
                )}
              </div>
              {docError && <div className="cost-reveal-note">{docError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setDocModalSlab(null)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={saveDocument} disabled={!docFile}><Check size={16} /> Save document</button>
            </div>
          </div>
        </div>
      )}

      {/* FAST ADD (BULK) MODAL */}
      {bulkOpen && (
        <div className="overlay" onClick={() => closeBulkAdd()}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Fast add slabs</h2>
              <button className="icon-btn" onClick={() => closeBulkAdd()}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ margin: 0 }}>Set shared defaults, fill in a row per slab, and save them all at once. Cost, pricing, photos, and documents can be added later by editing each one.</p>

              <div className="pricing-box">
                <div className="row-2">
                  <div className="field">
                    <label>Date received (all rows)</label>
                    <input type="date" value={bulkDefaults.dateReceived} onChange={(e) => setBulkDefaults((d) => ({ ...d, dateReceived: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Default owner</label>
                    <select value={bulkDefaults.owner} onChange={(e) => setBulkDefaults((d) => ({ ...d, owner: e.target.value }))}>
                      <option value="Shop">Shop</option>
                      {builders.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row-3">
                  <div className="field">
                    <label>Default vendor</label>
                    <select value={bulkDefaults.vendor} onChange={(e) => setBulkDefaults((d) => ({ ...d, vendor: e.target.value }))}>
                      <option value="">None</option>
                      {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Default lot #</label>
                    <input value={bulkDefaults.lotNumber} onChange={(e) => setBulkDefaults((d) => ({ ...d, lotNumber: e.target.value }))} placeholder="Shared lot #" />
                  </div>
                  <div className="field">
                    <label>Default thickness</label>
                    <select value={bulkDefaults.thickness} onChange={(e) => setBulkDefaults((d) => ({ ...d, thickness: e.target.value }))}>
                      <option>2cm</option>
                      <option>3cm</option>
                      <option>1.2cm</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
                <div className="row-2">
                  <div className="field">
                    <label>Default color</label>
                    <input list="color-options" value={bulkDefaults.color} onChange={(e) => setBulkDefaults((d) => ({ ...d, color: e.target.value }))} placeholder="Shared color" />
                  </div>
                  <div className="field">
                    <label>Default material type</label>
                    <select value={bulkDefaults.materialType} onChange={(e) => setBulkDefaults((d) => ({ ...d, materialType: e.target.value }))}>
                      <option value="">Not set</option>
                      {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={applyBulkDefaultsToRows}>Apply defaults to all rows below</button>
              </div>

              <div className="bulk-rows">
                {bulkRows.map((r, idx) => (
                  <div className="bulk-row" key={r.rowId}>
                    <div className="bulk-row-head">
                      <span className="meta-label">Slab {idx + 1}</span>
                      <button className="icon-btn" onClick={() => removeBulkRow(r.rowId)}><Trash2 size={14} /></button>
                    </div>
                    <div className="row-2">
                      <div className="field"><input placeholder="Material name" value={r.materialName} onChange={(e) => updateBulkRow(r.rowId, "materialName", e.target.value)} /></div>
                      <div className="field"><input list="color-options" placeholder="Color" value={r.color} onChange={(e) => updateBulkRow(r.rowId, "color", e.target.value)} /></div>
                    </div>
                    <div className="field">
                      <select value={r.materialType} onChange={(e) => updateBulkRow(r.rowId, "materialType", e.target.value)}>
                        <option value="">Material type (not set)</option>
                        {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="row-3">
                      <div className="field"><input type="number" placeholder="Length (in)" value={r.lengthIn} onChange={(e) => updateBulkRow(r.rowId, "lengthIn", e.target.value)} /></div>
                      <div className="field"><input type="number" placeholder="Width (in)" value={r.widthIn} onChange={(e) => updateBulkRow(r.rowId, "widthIn", e.target.value)} /></div>
                      <div className="field">
                        <select value={r.thickness} onChange={(e) => updateBulkRow(r.rowId, "thickness", e.target.value)}>
                          <option>2cm</option>
                          <option>3cm</option>
                          <option>1.2cm</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="row-3">
                      <div className="field"><input placeholder="Lot #" value={r.lotNumber} onChange={(e) => updateBulkRow(r.rowId, "lotNumber", e.target.value)} /></div>
                      <div className="field">
                        <select value={r.vendor} onChange={(e) => updateBulkRow(r.rowId, "vendor", e.target.value)}>
                          <option value="">Vendor</option>
                          {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <select value={r.owner} onChange={(e) => updateBulkRow(r.rowId, "owner", e.target.value)}>
                          <option value="Shop">Shop</option>
                          {builders.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-outline btn-block" onClick={addBulkRow}><Plus size={14} /> Add another row</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => closeBulkAdd()}>Cancel</button>
              <button className="btn btn-outline btn-block" onClick={() => saveBulkRows({ print: true })} disabled={!bulkValidCount}>
                <Printer size={16} /> Add & Print Labels
              </button>
              <button className="btn btn-primary btn-block" onClick={() => saveBulkRows()} disabled={!bulkValidCount}>
                <Check size={16} /> Add {bulkValidCount || ""} slab{bulkValidCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT LIST MODAL */}
      {printListOpen && (
        <div className="overlay" onClick={() => setPrintListOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print">
              <h2>Print slab list</h2>
              <button className="icon-btn" onClick={() => setPrintListOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="hint no-print" style={{ margin: 0 }}>This prints the {filtered.length} slab{filtered.length === 1 ? "" : "s"} matching your current tab, filters, and search.</p>
              <div className="print-options no-print">
                <label className="remnant-filter">
                  <input type="checkbox" checked={printIncludeWholesale} onChange={(e) => setPrintIncludeWholesale(e.target.checked)} />
                  Include wholesale price
                </label>
                {showCosts && (
                  <label className="remnant-filter">
                    <input type="checkbox" checked={printIncludeCost} onChange={(e) => setPrintIncludeCost(e.target.checked)} />
                    Include cost
                  </label>
                )}
              </div>

              <div className="print-list-sheet print-target">
                <div className="label-material" style={{ marginBottom: 10 }}>
                  Slab Inventory{activeTab !== "all" ? ` — ${activeTab}` : ""}{remnantOnly ? " (Remnants)" : ""}
                </div>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Size</th>
                      <th>Sqft</th>
                      <th>Thickness</th>
                      <th>Lot #</th>
                      <th>Vendor</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Job</th>
                      <th>Retail</th>
                      {printIncludeWholesale && <th>Wholesale</th>}
                      {printIncludeCost && <th>Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const sf = getSqft(s);
                      const { retail, wholesale, totalCost } = getPricing(s);
                      return (
                        <tr key={s.id}>
                          <td>{s.materialName}{s.kind === "remnant" ? " (Remnant)" : ""}</td>
                          <td>{s.kind === "remnant" ? "Irregular" : `${s.lengthIn}"×${s.widthIn}"`}</td>
                          <td>{sf ? sf.toFixed(1) : "—"}</td>
                          <td>{s.thickness}</td>
                          <td>{s.lotNumber || "—"}</td>
                          <td>{s.vendor || "—"}</td>
                          <td>{s.owner}</td>
                          <td>{STATUS_LABEL[s.status]}</td>
                          <td>{s.jobName || "—"}</td>
                          <td>{retail ? money(retail) : "—"}</td>
                          {printIncludeWholesale && <td>{wholesale ? money(wholesale) : "—"}</td>}
                          {printIncludeCost && <td>{totalCost ? money(totalCost) : "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer no-print">
              <button className="btn btn-outline btn-block" onClick={() => setPrintListOpen(false)}>Close</button>
              <button className="btn btn-primary btn-block" onClick={() => window.print()}><Printer size={16} /> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT ORDER MODAL */}
      {orderFormOpen && (
        <div className="overlay" onClick={() => setOrderFormOpen(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingOrderId ? "Edit order" : "Order materials"}</h2>
              <button className="icon-btn" onClick={() => setOrderFormOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="row-2">
                <div className="field">
                  <label>Material name</label>
                  <input value={orderForm.materialName} onChange={(e) => setOrderForm({ ...orderForm, materialName: e.target.value })} placeholder="e.g. Calacatta Gold" />
                </div>
                <div className="field">
                  <label>Color</label>
                  <input list="color-options" value={orderForm.color} onChange={(e) => setOrderForm({ ...orderForm, color: e.target.value })} placeholder="e.g. White" />
                </div>
              </div>
              <div className="field">
                <label>Material type</label>
                <select value={orderForm.materialType} onChange={(e) => setOrderForm({ ...orderForm, materialType: e.target.value })}>
                  <option value="">Not set</option>
                  {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Vendor</label>
                  <select
                    value={orderForm.vendor}
                    onChange={(e) => {
                      if (e.target.value === "__add__") setAddVendorOpen(true);
                      else setOrderForm({ ...orderForm, vendor: e.target.value });
                    }}
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                    <option value="__add__">+ Add new vendor…</option>
                  </select>
                </div>
                <div className="field">
                  <label>Thickness</label>
                  <select value={orderForm.thickness} onChange={(e) => setOrderForm({ ...orderForm, thickness: e.target.value })}>
                    <option>2cm</option>
                    <option>3cm</option>
                    <option>1.2cm</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Quantity (slabs expected)</label>
                  <input type="number" min="1" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} placeholder="1" />
                </div>
                <div className="field">
                  <label>Belongs to</label>
                  <select value={orderForm.owner} onChange={(e) => setOrderForm({ ...orderForm, owner: e.target.value })}>
                    <option value="Shop">Shop</option>
                    {builders.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Length (in)</label>
                  <input type="number" value={orderForm.lengthIn} onChange={(e) => setOrderForm({ ...orderForm, lengthIn: e.target.value })} placeholder="Optional" />
                </div>
                <div className="field">
                  <label>Width (in)</label>
                  <input type="number" value={orderForm.widthIn} onChange={(e) => setOrderForm({ ...orderForm, widthIn: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              {orderForm.lengthIn && orderForm.widthIn && (
                <div className="sqft-pill">{sqftOf(orderForm.lengthIn, orderForm.widthIn).toFixed(2)} sq ft per slab</div>
              )}
              <div className="row-2">
                <div className="field">
                  <label>Order date</label>
                  <input type="date" value={orderForm.orderDate} onChange={(e) => setOrderForm({ ...orderForm, orderDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Expected delivery date</label>
                  <input type="date" value={orderForm.expectedDate} onChange={(e) => setOrderForm({ ...orderForm, expectedDate: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Lot # (if known)</label>
                <input value={orderForm.lotNumber} onChange={(e) => setOrderForm({ ...orderForm, lotNumber: e.target.value })} placeholder="Optional" />
              </div>
              <div className="row-2">
                <div className="field">
                  <label>Job this is for</label>
                  <input value={orderForm.jobName} onChange={(e) => setOrderForm({ ...orderForm, jobName: e.target.value })} placeholder="Leave blank for general stock" />
                </div>
                <div className="field">
                  <label>Sales order #</label>
                  <input value={orderForm.salesOrderNumber} onChange={(e) => setOrderForm({ ...orderForm, salesOrderNumber: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              {orderForm.jobName && (
                <p className="hint" style={{ margin: 0 }}>Since this is for a job, the slabs will come in already reserved for "{orderForm.jobName}" when you receive this order.</p>
              )}
              <div className="field">
                <label>Notes</label>
                <textarea rows={2} value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setOrderFormOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-block" onClick={saveOrder}><Check size={16} /> {editingOrderId ? "Save changes" : "Add order"}</button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL ORDER CONFIRM */}
      {confirmCancelOrder && (
        <div className="overlay" onClick={() => setConfirmCancelOrder(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cancel this order?</h2>
              <button className="icon-btn" onClick={() => setConfirmCancelOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13.5 }}>This marks <b>{confirmCancelOrder.materialName}</b> as cancelled. You can still see it under "Cancelled" if you need to.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setConfirmCancelOrder(null)}>Keep order</button>
              <button className="btn btn-danger btn-block" onClick={() => cancelOrder(confirmCancelOrder)}>Cancel order</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ORDER CONFIRM */}
      {confirmDeleteOrder && (
        <div className="overlay" onClick={() => setConfirmDeleteOrder(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete this order?</h2>
              <button className="icon-btn" onClick={() => setConfirmDeleteOrder(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13.5 }}>This permanently removes the order for <b>{confirmDeleteOrder.materialName}</b>. This won't affect any slabs already received into inventory.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setConfirmDeleteOrder(null)}>Cancel</button>
              <button className="btn btn-danger btn-block" onClick={() => deleteOrder(confirmDeleteOrder)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete slab?</h2>
              <button className="icon-btn" onClick={() => setConfirmDelete(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13.5 }}>This removes <b>{confirmDelete.materialName}</b> (Lot {confirmDelete.lotNumber || "—"}) permanently, including its history.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-block" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger btn-block" onClick={() => deleteSlab(confirmDelete.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
