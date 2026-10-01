/* ============================================================
   Acoustic Engineering — js/canvas.js v2.1.0
   Interactive Engineering Canvas (SVG-based)
   ✅ Undo/Redo مُصلَح
   ✅ مزامنة مع speaker.js و engine.js
   ✅ Transform داخل SVG (crisp)
   ✅ دعم touch pinch-zoom
   ✅ أسماء موحّدة للبيانات
   ============================================================ */
(function () {
    "use strict";

    window.AcousticEngineering = window.AcousticEngineering || {};
    window.AE = window.AE || window.AcousticEngineering;

    const AE = window.AcousticEngineering;

    /* ═══════════════ Resolution helpers ═══════════════ */

    function getEngine() {
        return AE.engine || window.AcousticEngine || null;
    }

    function getSpeakerAPI() {
        return AE.speaker || window.AcousticSpeaker || window.SpeakerDatabase || null;
    }

    /* ═══════════════ Secure ID ═══════════════ */

    let _idCounter = 0;
    function generateId(prefix) {
        try {
            if (typeof crypto !== "undefined") {
                if (typeof crypto.randomUUID === "function") {
                    return `${prefix}-${crypto.randomUUID()}`;
                }
                if (crypto.getRandomValues) {
                    const b = new Uint8Array(6);
                    crypto.getRandomValues(b);
                    const hex = Array.from(b)
                        .map(x => x.toString(16).padStart(2, "0"))
                        .join("");
                    return `${prefix}-${hex}`;
                }
            }
        } catch { /* ignore */ }
        return `${prefix}-${Date.now().toString(36)}-${_idCounter++}`;
    }

    /* ═══════════════ قراءة مواصفات السماعة (مسطّحة/متداخلة) ═══════════════ */

    function readSpeakerSpecs(speaker) {
        if (!speaker) {
            return {
                rms: 500, maxSPL: 125, sensitivity: 96,
                horizontal: 90, vertical: 60,
                manufacturer: "", model: "", category: "Point Source"
            };
        }

        const power = speaker.power && typeof speaker.power === "object" && !Array.isArray(speaker.power)
            ? speaker.power : {};
        const cov = speaker.coverage && typeof speaker.coverage === "object" && !Array.isArray(speaker.coverage)
            ? speaker.coverage : {};

        const num = (v, fb) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
        };

        return {
            rms: num(
                speaker.rms_power ?? speaker.rms ?? power.rms,
                500
            ),
            maxSPL: num(
                speaker.max_spl ?? speaker.maxSPL,
                125
            ),
            sensitivity: num(speaker.sensitivity, 96),
            horizontal: num(
                speaker.horizontal_coverage ?? speaker.horizontal ?? speaker.horizontalCoverage ?? cov.horizontal,
                90
            ),
            vertical: num(
                speaker.vertical_coverage ?? speaker.vertical ?? speaker.verticalCoverage ?? cov.vertical,
                60
            ),
            manufacturer: speaker.manufacturer || "Generic",
            model: speaker.model || "Speaker",
            category: speaker.category || speaker.type || "Point Source"
        };
    }

    /* ═══════════════ Custom Confirm Dialog ═══════════════ */

    function confirmAsync(message, title) {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                background: rgba(0,0,0,.72); backdrop-filter: blur(7px);
            `;

            const dialog = document.createElement("div");
            dialog.style.cssText = `
                width: min(400px, 90%); padding: 22px;
                background: #10151d; border: 1px solid rgba(255,255,255,.09);
                border-radius: 14px; color: #e6edf5;
                font-family: Cairo, sans-serif; direction: rtl;
                box-shadow: 0 30px 100px rgba(0,0,0,.5);
            `;
            dialog.innerHTML = `
                <h3 style="margin:0 0 10px;font-size:15px;">${title || "تأكيد"}</h3>
                <p style="margin:0 0 20px;color:#9aa7b7;font-size:12px;line-height:1.7;">${message}</p>
                <div style="display:flex;gap:8px;justify-content:flex-start;">
                    <button id="cvCancel" style="height:36px;padding:0 16px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#aeb9c8;cursor:pointer;font-family:inherit;font-size:11px;">إلغاء</button>
                    <button id="cvOk" style="height:36px;padding:0 16px;border-radius:8px;border:1px solid #e60012;background:#e60012;color:#fff;cursor:pointer;font-family:inherit;font-size:11px;">تأكيد</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = (result) => {
                overlay.remove();
                document.removeEventListener("keydown", onKey);
                resolve(result);
            };

            const onKey = (e) => {
                if (e.key === "Escape") cleanup(false);
                if (e.key === "Enter") cleanup(true);
            };

            overlay.querySelector("#cvOk").onclick = () => cleanup(true);
            overlay.querySelector("#cvCancel").onclick = () => cleanup(false);
            overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
            document.addEventListener("keydown", onKey);

            setTimeout(() => overlay.querySelector("#cvOk")?.focus(), 50);
        });
    }

    /* ═══════════════════════════════════════════════════════════
       CANVAS
       ═══════════════════════════════════════════════════════════ */

    const AcousticCanvas = {
        state: {
            initialized: false,
            tool: "select",
            zoom: 1,
            minZoom: 0.35,
            maxZoom: 4,
            panX: 0,
            panY: 0,
            gridVisible: true,
            snapEnabled: true,
            snapDistance: 0.25,
            selectedId: null,
            selectedType: null,
            dragging: false,
            drawing: false,
            measuring: false,
            panning: false,
            dragStart: null,
            dragHistoryPushed: false,
            measureStart: null,
            wallStart: null,
            zoneStart: null,
            currentPointer: null,
            objects: [],
            history: [],
            historyIndex: -1,
            room: { width: 20, depth: 15, height: 4 },
            svg: null,
            container: null,
            roomRect: null,
            transformLayer: null,   // ← جديد: لتكبير crisp
            grid: null,
            speakersLayer: null,
            wallsLayer: null,
            zonesLayer: null,
            measurementLayer: null,
            coverageLayer: null,
            selectionLayer: null,
            cursorPoint: null,
            cursorCoordinates: null,
            // pinch zoom
            activePointers: new Map(),
            pinchStartDistance: 0,
            pinchStartZoom: 1
        },

        /* ═══════════════ INIT ═══════════════ */
        init: function () {
            if (this.state.initialized) return;
            this.cacheElements();

            if (!this.state.svg) {
                console.warn("[Canvas] SVG element not found");
                return;
            }

            this.ensureTransformLayer();
            this.state.initialized = true;
            this.bindEvents();
            this.bindExternalEvents();

            this.updateRoom(
                this.state.room.width,
                this.state.room.depth,
                this.state.room.height
            );
            this.render();
            this.updateEmptyState();
        },

        /* ═══════════════ CACHE ═══════════════ */
        cacheElements: function () {
            const s = this.state;

            s.svg = document.getElementById("engineeringCanvas")
                 || document.getElementById("designSvg");

            s.container = document.querySelector(".canvas-stage")
                       || document.getElementById("canvasContainer")
                       || (s.svg ? s.svg.parentElement : null);

            s.roomRect = document.getElementById("roomRect");
            s.grid = document.getElementById("gridLayer") || document.getElementById("canvasGrid");

            s.wallsLayer       = document.getElementById("roomLayer")     || document.getElementById("wallsLayer");
            s.speakersLayer    = document.getElementById("objectLayer")   || document.getElementById("speakersLayer");
            s.coverageLayer    = document.getElementById("coverageLayer");
            s.measurementLayer = document.getElementById("measurementLayer");
            s.selectionLayer   = document.getElementById("selectionLayer");
            s.zonesLayer       = document.getElementById("zonesLayer");

            s.cursorCoordinates = document.getElementById("cursorCoordinates");
            s.cursorPoint = document.getElementById("cursorPoint");
        },

        /**
         * ينشئ <g id="canvasTransformLayer"> يحتوي كل الطبقات
         * الحل: التكبير عبر transform على g بدل SVG (crisp)
         */
        ensureTransformLayer: function () {
            const svg = this.state.svg;
            if (!svg) return;

            let layer = svg.querySelector("#canvasTransformLayer");
            if (layer) {
                this.state.transformLayer = layer;
                return;
            }

            layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
            layer.id = "canvasTransformLayer";
            layer.setAttribute("transform", "translate(0,0) scale(1)");

            // انقل كل children SVG (ما عدا defs و rect الخلفية) إلى الطبقة الجديدة
            const movable = [];
            for (const child of Array.from(svg.children)) {
                const tag = child.tagName.toLowerCase();
                const id = child.id || "";
                if (tag === "defs" || id === "canvasBackground") continue;
                movable.push(child);
            }
            movable.forEach(el => layer.appendChild(el));
            svg.appendChild(layer);

            this.state.transformLayer = layer;
        },

        /* ═══════════════ EVENTS ═══════════════ */
        bindEvents: function () {
            const s = this.state;
            if (!s.svg) return;

            s.svg.addEventListener("pointerdown", this.onPointerDown.bind(this));
            s.svg.addEventListener("pointermove", this.onPointerMove.bind(this));
            s.svg.addEventListener("pointerup", this.onPointerUp.bind(this));
            s.svg.addEventListener("pointercancel", this.onPointerUp.bind(this));
            s.svg.addEventListener("pointerleave", this.onPointerUp.bind(this));
            s.svg.addEventListener("wheel", this.onWheel.bind(this), { passive: false });
            s.svg.addEventListener("dblclick", this.onDoubleClick.bind(this));
            s.svg.addEventListener("contextmenu", (e) => e.preventDefault());

            // Debounced resize
            let resizeTimer = null;
            window.addEventListener("resize", () => {
                if (resizeTimer) clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => this.refreshCanvas(), 150);
            });

            // Keyboard shortcuts
            document.addEventListener("keydown", (e) => {
                const tag = (document.activeElement?.tagName || "").toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select") return;

                if (e.key === "Delete" || e.key === "Backspace") {
                    if (this.state.selectedId) {
                        e.preventDefault();
                        this.deleteSelected();
                    }
                }
                if (e.key === "Escape") {
                    this.clearSelection();
                    this.cancelWall();
                    this.cancelZone();
                }
                if (e.key === "r" && this.state.selectedId) {
                    this.rotateSelectedObject(e.shiftKey ? -15 : 15);
                }
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === "z" && !e.shiftKey) {
                        e.preventDefault();
                        this.undo();
                    }
                    if ((e.key === "z" && e.shiftKey) || e.key === "y") {
                        e.preventDefault();
                        this.redo();
                    }
                }
            });
        },

        /**
         * يربط canvas بـ engine.js و speaker.js (event-driven sync)
         */
        bindExternalEvents: function () {
            // عندما ينتهي autoDesign
            window.addEventListener("engine:auto-design-complete", (e) => {
                const result = e.detail;
                if (result && Array.isArray(result.layout)) {
                    this.state.objects = result.layout.map(o => this.normalizeObject(o));
                    this.render();
                }
            });

            // عندما يُحمَّل تصميم
            window.addEventListener("engine:design-loaded", (e) => {
                const data = e.detail;
                if (data && Array.isArray(data.speakers)) {
                    this.state.objects = data.speakers.map(o => this.normalizeObject(o));
                    this.render();
                }
            });

            // عندما تُضاف سماعة من مكتبة speaker.js
            window.addEventListener("speaker:added", (e) => {
                const speaker = e.detail;
                if (speaker && speaker.id) {
                    // لا نضيف تلقائياً — فقط نتذكّر آخر سماعة
                    this.state.lastSpeakerId = speaker.id;
                }
            });

            // عندما تُحدَّث السماعات
            window.addEventListener("speakers:changed", () => {
                // أعِد الرسم بأسعار جديدة
                this.render();
            });

            // من app.html
            window.addEventListener("canvas:add-speaker", (e) => {
                const detail = e.detail || {};
                this.addSpeakerAt(
                    { x: detail.x || 0, y: detail.y || 0 },
                    detail.speakerId || this.state.lastSpeakerId
                );
            });
        },

        /* ═══════════════ TOOL ═══════════════ */
        setTool: function (tool) {
            const valid = ["select", "wall", "speaker", "measure", "zone", "pan"];
            if (valid.indexOf(tool) === -1) tool = "select";

            this.state.tool = tool;
            this.state.drawing = false;
            this.state.measuring = false;
            this.state.dragging = false;
            this.state.wallStart = null;
            this.state.measureStart = null;
            this.state.zoneStart = null;

            this.clearTemporaryGraphics();

            if (this.state.svg) {
                this.state.svg.style.cursor = this.getCursorForTool(tool);
            }
            this.updateStatus(this.getToolLabel(tool));
        },

        getCursorForTool: function (tool) {
            return {
                select: "default",
                wall: "crosshair",
                speaker: "copy",
                measure: "crosshair",
                zone: "crosshair",
                pan: "grab"
            }[tool] || "default";
        },

        getToolLabel: function (tool) {
            return {
                select: "وضع التحديد",
                wall: "رسم الجدران",
                speaker: "إضافة سماعة — اضغط داخل المخطط",
                measure: "وضع القياس — اضغط نقطتين",
                zone: "رسم منطقة — اضغط واسحب",
                pan: "تحريك العرض"
            }[tool] || "وضع التصميم";
        },

        /* ═══════════════ ROOM ═══════════════ */
        updateRoom: function (width, depth, height) {
            width  = Number(width)  || 20;
            depth  = Number(depth)  || 15;
            height = Number(height) || 4;

            this.state.room = { width, depth, height };

            const svg = this.state.svg;
            if (!svg) return;

            let rect = this.state.roomRect;
            if (!rect) {
                rect = this.createSvg("rect");
                rect.id = "roomRect";
                rect.setAttribute("fill", "rgba(56, 189, 248, 0.03)");
                rect.setAttribute("stroke", "#38bdf8");
                rect.setAttribute("stroke-width", "2");
                rect.setAttribute("rx", "4");
                const layer = this.state.wallsLayer || svg;
                layer.insertBefore(rect, layer.firstChild);
            }
            this.state.roomRect = rect;

            const vb = svg.viewBox.baseVal;
            const vbW = vb.width  || 1000;
            const vbH = vb.height || 700;

            const padding = 80;
            const maxW = vbW - padding * 2;
            const maxH = vbH - padding * 2;
            const aspect = width / depth;

            let roomW, roomH;
            if (aspect >= maxW / maxH) {
                roomW = maxW;
                roomH = roomW / aspect;
            } else {
                roomH = maxH;
                roomW = roomH * aspect;
            }

            const x = (vbW - roomW) / 2;
            const y = (vbH - roomH) / 2;

            rect.setAttribute("x", x);
            rect.setAttribute("y", y);
            rect.setAttribute("width", roomW);
            rect.setAttribute("height", roomH);

            this.render();
        },

        /* ═══════════════ TRANSFORMS ═══════════════ */
        screenToSvg: function (event) {
            const svg = this.state.svg;
            if (!svg) return { x: 0, y: 0 };

            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;

            const matrix = svg.getScreenCTM();
            if (!matrix) return { x: 0, y: 0 };

            const result = point.matrixTransform(matrix.inverse());
            return { x: result.x, y: result.y };
        },

        svgToMeters: function (point) {
            const room = this.getRoomBounds();
            if (!room) return { x: 0, y: 0 };

            return {
                x: ((point.x - room.x) / room.width) * this.state.room.width,
                y: ((point.y - room.y) / room.height) * this.state.room.depth
            };
        },

        metersToSvg: function (point) {
            const room = this.getRoomBounds();
            if (!room) return { x: 0, y: 0 };

            return {
                x: room.x + (point.x / this.state.room.width) * room.width,
                y: room.y + (point.y / this.state.room.depth) * room.height
            };
        },

        getRoomBounds: function () {
            const rect = this.state.roomRect;
            if (!rect) return null;
            return {
                x: Number(rect.getAttribute("x")),
                y: Number(rect.getAttribute("y")),
                width: Number(rect.getAttribute("width")),
                height: Number(rect.getAttribute("height"))
            };
        },

        clampMeters: function (point, margin) {
            margin = Number(margin) || 0;
            return {
                x: Math.max(margin, Math.min(this.state.room.width - margin, point.x)),
                y: Math.max(margin, Math.min(this.state.room.depth - margin, point.y))
            };
        },

        snapPoint: function (point) {
            if (!this.state.snapEnabled) return point;
            const d = Number(this.state.snapDistance) || 0.25;
            return {
                x: Math.round(point.x / d) * d,
                y: Math.round(point.y / d) * d
            };
        },

        /* ═══════════════ POINTER ═══════════════ */
        onPointerDown: function (event) {
            // Touch: pinch-zoom
            if (event.pointerType === "touch") {
                this.state.activePointers.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY
                });

                if (this.state.activePointers.size === 2) {
                    const pts = Array.from(this.state.activePointers.values());
                    this.state.pinchStartDistance = Math.hypot(
                        pts[0].x - pts[1].x,
                        pts[0].y - pts[1].y
                    );
                    this.state.pinchStartZoom = this.state.zoom;
                    return;
                }
            }

            if (event.button !== 0 && event.pointerType !== "touch") return;
            this.state.currentPointer = event;

            const svgPoint = this.screenToSvg(event);
            const meterPoint = this.clampMeters(this.svgToMeters(svgPoint));

            if (event.shiftKey || this.state.tool === "pan") {
                this.startPan(event);
                return;
            }

            if (this.state.tool === "select") {
                const el = event.target.closest?.("[data-object-id]");
                if (el) {
                    this.selectObject(el.getAttribute("data-object-id"));
                    this.startDrag(event);
                } else {
                    this.clearSelection();
                }
                return;
            }

            if (this.state.tool === "speaker") {
                this.addSpeakerAt(meterPoint, this.state.lastSpeakerId);
                return;
            }

            if (this.state.tool === "wall")    { this.startWall(meterPoint); return; }
            if (this.state.tool === "measure") { this.startMeasurement(meterPoint); return; }
            if (this.state.tool === "zone")    { this.startZone(meterPoint); return; }
        },

        onPointerMove: function (event) {
            this.state.currentPointer = event;

            // Touch pinch-zoom
            if (event.pointerType === "touch" && this.state.activePointers.has(event.pointerId)) {
                this.state.activePointers.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY
                });

                if (this.state.activePointers.size === 2 && this.state.pinchStartDistance > 0) {
                    const pts = Array.from(this.state.activePointers.values());
                    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                    const ratio = dist / this.state.pinchStartDistance;
                    this.setZoom(this.state.pinchStartZoom * ratio);
                    return;
                }
            }

            this.updateCoordinates(event);

            if (this.state.dragging) { this.dragSelectedObject(event); return; }
            if (this.state.panning)  { this.panMove(event); return; }
            if (this.state.drawing && this.state.tool === "wall") { this.previewWall(event); return; }
            if (this.state.measuring) { this.previewMeasurement(event); return; }
            if (this.state.drawing && this.state.tool === "zone") { this.previewZone(event); return; }
        },

        onPointerUp: function (event) {
            // Touch cleanup
            if (event && event.pointerType === "touch") {
                this.state.activePointers.delete(event.pointerId);
                if (this.state.activePointers.size < 2) {
                    this.state.pinchStartDistance = 0;
                }
            }

            if (this.state.dragging) {
                this.finishDrag();
                try { this.state.svg.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
            }
            if (this.state.panning) this.finishPan();
            if (this.state.drawing && this.state.tool === "wall") this.finishWall(event);
            if (this.state.measuring) this.finishMeasurement(event);
            if (this.state.drawing && this.state.tool === "zone") this.finishZone(event);
        },

        onDoubleClick: function (event) {
            const el = event.target.closest?.("[data-object-id]");
            if (!el) return;
            const obj = this.getObjectById(el.getAttribute("data-object-id"));
            if (obj && obj.type === "speaker") {
                this.rotateObject(obj.id, 15);
            }
        },

        onWheel: function (event) {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.12 : 0.89;
            this.setZoom(this.state.zoom * factor);
        },

        updateCoordinates: function (event) {
            event = event || this.state.currentPointer;
            if (!event) return;

            const svgPoint = this.screenToSvg(event);
            const meterPoint = this.clampMeters(this.svgToMeters(svgPoint));

            if (this.state.cursorCoordinates) {
                this.state.cursorCoordinates.textContent =
                    `X: ${meterPoint.x.toFixed(2)}m | Y: ${meterPoint.y.toFixed(2)}m`;
            }
        },

        /* ═══════════════ SELECTION ═══════════════ */
        selectObject: function (id) {
            const obj = this.getObjectById(id);
            if (!obj) return;

            this.state.selectedId = id;
            this.state.selectedType = obj.type;
            this.renderSelection();
            this.populateInspector(obj);
            this.updateStatus("تم تحديد: " + (obj.model || obj.type));

            try {
                window.dispatchEvent(new CustomEvent("canvas:selected", {
                    detail: { object: obj }
                }));
            } catch { /* ignore */ }
        },

        clearSelection: function () {
            this.state.selectedId = null;
            this.state.selectedType = null;
            this.renderSelection();
            this.clearInspector();
        },

        getSelectedObject: function () {
            if (!this.state.selectedId) return null;
            return this.getObjectById(this.state.selectedId);
        },

        getObjectById: function (id) {
            return this.state.objects.find(o => o.id === id) || null;
        },

        renderSelection: function () {
            const layer = this.state.selectionLayer;
            if (!layer) return;
            layer.innerHTML = "";

            const obj = this.getSelectedObject();
            if (!obj) return;

            if (obj.type === "speaker") {
                const point = this.metersToSvg({ x: obj.x, y: obj.y });
                const c = this.createSvg("circle");
                c.setAttribute("cx", point.x);
                c.setAttribute("cy", point.y);
                c.setAttribute("r", 28);
                c.setAttribute("fill", "none");
                c.setAttribute("stroke", "#38bdf8");
                c.setAttribute("stroke-width", "2");
                c.setAttribute("stroke-dasharray", "6 4");
                c.setAttribute("pointer-events", "none");
                layer.appendChild(c);
            }

            if (obj.type === "wall") {
                const a = this.metersToSvg({ x: obj.x1, y: obj.y1 });
                const b = this.metersToSvg({ x: obj.x2, y: obj.y2 });
                const line = this.createSvg("line");
                line.setAttribute("x1", a.x);
                line.setAttribute("y1", a.y);
                line.setAttribute("x2", b.x);
                line.setAttribute("y2", b.y);
                line.setAttribute("stroke", "#38bdf8");
                line.setAttribute("stroke-width", "10");
                line.setAttribute("stroke-opacity", "0.35");
                line.setAttribute("stroke-linecap", "round");
                line.setAttribute("pointer-events", "none");
                layer.appendChild(line);
            }
        },

        /* ═══════════════ INSPECTOR ═══════════════ */
        populateInspector: function (obj) {
            const info = document.getElementById("selectionInfo");
            const empty = document.getElementById("selectionEmpty");
            if (info) info.style.display = "";
            if (empty) empty.style.display = "none";

            const name = document.getElementById("selectedObjectName");
            if (name) name.textContent = obj.model || obj.name || obj.type || "Object";

            const type = document.getElementById("selectedObjectType");
            if (type) type.textContent = (obj.type || "").toUpperCase();

            const specs = readSpeakerSpecs(obj);

            this.setValue("speakerPower", specs.rms);
            this.setValue("speakerSPL", specs.maxSPL);
            this.setValue("speakerModel", specs.model);
            this.setValue("selectedX", obj.x);
            this.setValue("selectedY", obj.y);
            this.setValue("selectedZ", obj.z ?? obj.mountingHeight ?? 3);
            this.setValue("selectedRotation", obj.rotation || 0);
        },

        clearInspector: function () {
            const info = document.getElementById("selectionInfo");
            if (info) info.style.display = "none";
            const empty = document.getElementById("selectionEmpty");
            if (empty) empty.style.display = "";
        },

        setValue: function (id, value) {
            const el = document.getElementById(id);
            if (el) el.value = value ?? "";
        },

        /* ═══════════════ ADD SPEAKER ═══════════════ */
        addSpeakerAt: function (point, speakerId) {
            point = this.snapPoint(point);
            point = this.clampMeters(point, 0.15);

            const mountingHeight = Math.max(2.2, this.state.room.height - 0.2);

            // اقرأ مواصفات من speaker.js إن وُجد
            let specs = {
                rms: 500, maxSPL: 125,
                horizontal: 90, vertical: 60,
                manufacturer: "Generic", model: "Custom Speaker",
                category: "Point Source"
            };

            const speakerApi = getSpeakerAPI();
            if (speakerId && speakerApi) {
                try {
                    const found = speakerApi.getById?.(speakerId) || speakerApi.get?.(speakerId);
                    if (found) specs = readSpeakerSpecs(found);
                } catch { /* ignore */ }
            } else if (speakerApi) {
                // لم يُحدَّد — استخدم الأول من المكتبة
                const db = speakerApi.list?.() || [];
                if (db.length) specs = readSpeakerSpecs(db[0]);
            }

            const speaker = {
                id: generateId("SPK"),
                type: "speaker",
                speakerId: speakerId || null,   // ← مفتاح الربط مع speaker.js
                name: specs.model,
                model: specs.model,
                manufacturer: specs.manufacturer,
                category: specs.category,
                x: Number(point.x.toFixed(3)),
                y: Number(point.y.toFixed(3)),
                z: mountingHeight,
                rotation: 0,
                rms_power: specs.rms,
                max_spl: specs.maxSPL,
                horizontal_coverage: specs.horizontal,
                vertical_coverage: specs.vertical,
                mountingHeight: mountingHeight,
                gain: 0,
                delay: 0
            };

            this.pushHistory();
            this.state.objects.push(speaker);
            this.selectObject(speaker.id);
            this.render();
            this.updateMetrics();
            this.updateStatus(
                `✓ تمت إضافة السماعة — ${this.state.objects.filter(o => o.type === "speaker").length} سماعة`
            );
            this.dispatchChange();

            return speaker;
        },

        /**
         * يضمن أن الكائن قادم من engine.js يحتوي كل الحقول المطلوبة
         */
        normalizeObject: function (obj) {
            if (!obj || typeof obj !== "object") return obj;

            const specs = readSpeakerSpecs(obj);

            return {
                ...obj,
                id: obj.id || generateId("SPK"),
                type: obj.type || "speaker",
                speakerId: obj.speakerId || null,
                model: obj.model || specs.model,
                manufacturer: obj.manufacturer || specs.manufacturer,
                category: obj.category || specs.category,
                x: Number(obj.x) || 0,
                y: Number(obj.y) || 0,
                z: Number(obj.z ?? obj.mountingHeight) || 3,
                rotation: Number(obj.rotation) || 0,
                rms_power: specs.rms,
                max_spl: specs.maxSPL,
                horizontal_coverage: specs.horizontal,
                vertical_coverage: specs.vertical,
                mountingHeight: Number(obj.mountingHeight ?? obj.z) || 3,
                gain: Number(obj.gain) || 0,
                delay: Number(obj.delay) || 0
            };
        },

        /* ═══════════════ DRAG (مُصلَح) ═══════════════ */
        startDrag: function (event) {
            const obj = this.getSelectedObject();
            if (!obj) return;

            this.state.dragging = true;
            this.state.dragHistoryPushed = false;  // ← علم: لم يُحفظ بعد
            this.state.dragStart = {
                eventX: event.clientX,
                eventY: event.clientY,
                objectX: obj.x,
                objectY: obj.y
            };

            try { this.state.svg.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        },

        dragSelectedObject: function (event) {
            const obj = this.getSelectedObject();
            const start = this.state.dragStart;
            if (!obj || !start) return;

            // ✅ احفظ الحالة قبل أول تعديل فعلي (أول حركة)
            if (!this.state.dragHistoryPushed) {
                this.pushHistory();
                this.state.dragHistoryPushed = true;
            }

            const current = this.screenToSvg(event);
            const startPoint = this.screenToSvg({
                clientX: start.eventX,
                clientY: start.eventY
            });

            const curM = this.svgToMeters(current);
            const startM = this.svgToMeters(startPoint);

            let newPoint = {
                x: start.objectX + (curM.x - startM.x),
                y: start.objectY + (curM.y - startM.y)
            };

            newPoint = this.clampMeters(newPoint, 0.15);
            if (this.state.snapEnabled) {
                newPoint = this.snapPoint(newPoint);
                newPoint = this.clampMeters(newPoint, 0.15);
            }

            obj.x = Number(newPoint.x.toFixed(3));
            obj.y = Number(newPoint.y.toFixed(3));

            this.render();
            this.populateInspector(obj);
        },

        finishDrag: function () {
            this.state.dragging = false;
            this.state.dragStart = null;
            this.state.dragHistoryPushed = false;
            this.dispatchChange();
        },

        /* ═══════════════ WALL ═══════════════ */
        startWall: function (point) {
            point = this.snapPoint(point);
            point = this.clampMeters(point);
            this.state.wallStart = point;
            this.state.drawing = true;
            this.updateStatus("حدد نقطة نهاية الجدار");
        },

        previewWall: function (event) {
            const start = this.state.wallStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.snapPoint(this.svgToMeters(svgPoint));
            end = this.clampMeters(end);

            const layer = this.state.measurementLayer || this.state.wallsLayer;
            if (!layer) return;

            let preview = document.getElementById("temporaryWall");
            if (!preview) {
                preview = this.createSvg("line");
                preview.id = "temporaryWall";
                preview.setAttribute("stroke", "#38bdf8");
                preview.setAttribute("stroke-width", "5");
                preview.setAttribute("stroke-dasharray", "10 6");
                preview.setAttribute("stroke-linecap", "round");
                preview.setAttribute("pointer-events", "none");
                layer.appendChild(preview);
            }

            const a = this.metersToSvg(start);
            const b = this.metersToSvg(end);

            preview.setAttribute("x1", a.x);
            preview.setAttribute("y1", a.y);
            preview.setAttribute("x2", b.x);
            preview.setAttribute("y2", b.y);

            const d = Math.hypot(end.x - start.x, end.y - start.y);
            this.updateStatus("طول الجدار: " + d.toFixed(2) + " m");
        },

        finishWall: function (event) {
            if (!this.state.wallStart) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.snapPoint(this.svgToMeters(svgPoint));
            end = this.clampMeters(end);

            const start = this.state.wallStart;
            const d = Math.hypot(end.x - start.x, end.y - start.y);

            if (d < 0.05) { this.cancelWall(); return; }

            this.pushHistory();

            this.state.objects.push({
                id: generateId("WALL"),
                type: "wall",
                x1: Number(start.x.toFixed(3)),
                y1: Number(start.y.toFixed(3)),
                x2: Number(end.x.toFixed(3)),
                y2: Number(end.y.toFixed(3)),
                height: this.state.room.height,
                thickness: 0.15
            });

            this.cancelWall();
            this.render();
            this.dispatchChange();
            this.updateStatus("✓ تم رسم جدار بطول " + d.toFixed(2) + " m");
        },

        cancelWall: function () {
            const preview = document.getElementById("temporaryWall");
            if (preview) preview.remove();
            this.state.wallStart = null;
            this.state.drawing = false;
        },

        /* ═══════════════ MEASURE ═══════════════ */
        startMeasurement: function (point) {
            this.state.measureStart = this.clampMeters(point);
            this.state.measuring = true;
            this.updateStatus("حدد نقطة القياس الثانية");
        },

        previewMeasurement: function (event) {
            const start = this.state.measureStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.clampMeters(this.svgToMeters(svgPoint));

            const layer = this.state.measurementLayer;
            if (!layer) return;

            let line = document.getElementById("temporaryMeasurement");
            let text = document.getElementById("temporaryMeasurementText");

            if (!line) {
                line = this.createSvg("line");
                line.id = "temporaryMeasurement";
                line.setAttribute("stroke", "#f59e0b");
                line.setAttribute("stroke-width", "3");
                line.setAttribute("stroke-dasharray", "8 5");
                line.setAttribute("pointer-events", "none");
                layer.appendChild(line);
            }

            if (!text) {
                text = this.createSvg("text");
                text.id = "temporaryMeasurementText";
                text.setAttribute("fill", "#f59e0b");
                text.setAttribute("font-size", "14");
                text.setAttribute("font-family", "Cairo, sans-serif");
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("pointer-events", "none");
                layer.appendChild(text);
            }

            const a = this.metersToSvg(start);
            const b = this.metersToSvg(end);

            line.setAttribute("x1", a.x);
            line.setAttribute("y1", a.y);
            line.setAttribute("x2", b.x);
            line.setAttribute("y2", b.y);

            const d = Math.hypot(end.x - start.x, end.y - start.y);

            text.setAttribute("x", (a.x + b.x) / 2);
            text.setAttribute("y", (a.y + b.y) / 2 - 10);
            text.textContent = d.toFixed(2) + " m";
        },

        finishMeasurement: function (event) {
            const start = this.state.measureStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            const end = this.clampMeters(this.svgToMeters(svgPoint));

            const d = Math.hypot(end.x - start.x, end.y - start.y);
            this.removeTemporaryMeasurement();
            this.state.measureStart = null;
            this.state.measuring = false;
            this.updateStatus("المسافة: " + d.toFixed(2) + " m");
        },

        removeTemporaryMeasurement: function () {
            ["temporaryMeasurement", "temporaryMeasurementText"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        },

        /* ═══════════════ ZONE ═══════════════ */
        startZone: function (point) {
            this.state.zoneStart = this.clampMeters(point);
            this.state.drawing = true;
            this.updateStatus("حدد الزاوية المقابلة للمنطقة");
        },

        previewZone: function (event) {
            const start = this.state.zoneStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            const end = this.clampMeters(this.svgToMeters(svgPoint));

            const a = this.metersToSvg(start);
            const b = this.metersToSvg(end);

            const layer = this.state.zonesLayer || this.state.measurementLayer;
            if (!layer) return;

            let rect = document.getElementById("temporaryZone");
            if (!rect) {
                rect = this.createSvg("rect");
                rect.id = "temporaryZone";
                rect.setAttribute("fill", "rgba(56,189,248,0.08)");
                rect.setAttribute("stroke", "#38bdf8");
                rect.setAttribute("stroke-width", "2");
                rect.setAttribute("stroke-dasharray", "8 5");
                rect.setAttribute("pointer-events", "none");
                layer.appendChild(rect);
            }

            rect.setAttribute("x", Math.min(a.x, b.x));
            rect.setAttribute("y", Math.min(a.y, b.y));
            rect.setAttribute("width", Math.abs(b.x - a.x));
            rect.setAttribute("height", Math.abs(b.y - a.y));
        },

        finishZone: function (event) {
            const start = this.state.zoneStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            const end = this.clampMeters(this.svgToMeters(svgPoint));

            const w = Math.abs(end.x - start.x);
            const d = Math.abs(end.y - start.y);

            if (w < 0.1 || d < 0.1) { this.cancelZone(); return; }

            this.pushHistory();

            this.state.objects.push({
                id: generateId("ZONE"),
                type: "zone",
                name: "منطقة صوتية",
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: w,
                depth: d
            });

            this.cancelZone();
            this.render();
            this.dispatchChange();
        },

        cancelZone: function () {
            const rect = document.getElementById("temporaryZone");
            if (rect) rect.remove();
            this.state.zoneStart = null;
            this.state.drawing = false;
        },

        /* ═══════════════ PAN ═══════════════ */
        startPan: function (event) {
            this.state.panning = true;
            this.state.panStart = {
                x: event.clientX,
                y: event.clientY,
                panX: this.state.panX,
                panY: this.state.panY
            };
            if (this.state.svg) this.state.svg.style.cursor = "grabbing";
        },

        panMove: function (event) {
            const start = this.state.panStart;
            if (!start) return;

            this.state.panX = start.panX + (event.clientX - start.x);
            this.state.panY = start.panY + (event.clientY - start.y);
            this.applyTransform();
        },

        finishPan: function () {
            this.state.panning = false;
            this.state.panStart = null;
            if (this.state.svg) {
                this.state.svg.style.cursor = this.getCursorForTool(this.state.tool);
            }
        },

        /* ═══════════════ ZOOM ═══════════════ */
        setZoom: function (zoom) {
            zoom = Number(zoom) || 1;
            zoom = Math.max(this.state.minZoom, Math.min(this.state.maxZoom, zoom));
            this.state.zoom = zoom;
            this.applyTransform();

            const label = document.getElementById("zoomLevel")
                       || document.getElementById("canvasZoomValue")
                       || document.getElementById("zoomLabel");
            if (label) label.textContent = Math.round(zoom * 100) + "%";
        },

        zoomIn: function () { this.setZoom(this.state.zoom * 1.15); },
        zoomOut: function () { this.setZoom(this.state.zoom * 0.87); },

        resetZoom: function () {
            this.state.zoom = 1;
            this.state.panX = 0;
            this.state.panY = 0;
            this.applyTransform();
            const label = document.getElementById("zoomLevel") || document.getElementById("canvasZoomValue");
            if (label) label.textContent = "100%";
        },

        fitView: function () {
            // 100% + إعادة التمركز — سلوك بسيط
            this.resetZoom();
        },

        /**
         * ✅ تطبيق التحويل على <g> داخل SVG (crisp rendering)
         * بدل CSS transform على <svg> (blurry)
         */
        applyTransform: function () {
            const layer = this.state.transformLayer;
            if (!layer) return;

            const svg = this.state.svg;
            const vb = svg.viewBox.baseVal;
            const vbW = vb.width || 1000;
            const vbH = vb.height || 700;

            // حوّل الـ pan (بكسل) إلى وحدات SVG
            const rect = svg.getBoundingClientRect();
            const scaleX = rect.width ? vbW / rect.width : 1;
            const scaleY = rect.height ? vbH / rect.height : 1;

            const panX = this.state.panX * scaleX;
            const panY = this.state.panY * scaleY;

            const z = this.state.zoom;
            const cx = vbW / 2;
            const cy = vbH / 2;

            // حول نقطة المركز
            const tx = cx - (cx * z) + panX;
            const ty = cy - (cy * z) + panY;

            layer.setAttribute("transform",
                `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) scale(${z.toFixed(3)})`);
        },

        /* ═══════════════ RENDER ═══════════════ */
        render: function () {
            this.renderWalls();
            this.renderZones();
            this.renderSpeakers();
            this.renderSelection();
            this.updateMetrics();
            this.updateEmptyState();
        },

        renderWalls: function () {
            const layer = this.state.wallsLayer;
            if (!layer) return;

            const preview = document.getElementById("temporaryWall");
            const roomRect = this.state.roomRect;

            // مسح كل شيء ثم أعِد الإضافة
            layer.innerHTML = "";
            if (roomRect) layer.appendChild(roomRect);
            if (preview) layer.appendChild(preview);

            const walls = this.state.objects.filter(o => o.type === "wall");

            walls.forEach(wall => {
                const a = this.metersToSvg({ x: wall.x1, y: wall.y1 });
                const b = this.metersToSvg({ x: wall.x2, y: wall.y2 });

                const line = this.createSvg("line");
                line.setAttribute("x1", a.x);
                line.setAttribute("y1", a.y);
                line.setAttribute("x2", b.x);
                line.setAttribute("y2", b.y);
                line.setAttribute("stroke", "#64748b");
                line.setAttribute("stroke-width", "8");
                line.setAttribute("stroke-linecap", "round");
                line.setAttribute("data-object-id", wall.id);
                line.style.cursor = "pointer";
                layer.appendChild(line);
            });
        },

        renderZones: function () {
            const layer = this.state.zonesLayer;
            if (!layer) return;

            const preview = document.getElementById("temporaryZone");
            layer.innerHTML = "";
            if (preview) layer.appendChild(preview);

            const zones = this.state.objects.filter(o => o.type === "zone");

            zones.forEach(zone => {
                const a = this.metersToSvg({ x: zone.x, y: zone.y });
                const b = this.metersToSvg({ x: zone.x + zone.width, y: zone.y + zone.depth });

                const rect = this.createSvg("rect");
                rect.setAttribute("x", a.x);
                rect.setAttribute("y", a.y);
                rect.setAttribute("width", Math.abs(b.x - a.x));
                rect.setAttribute("height", Math.abs(b.y - a.y));
                rect.setAttribute("fill", "rgba(56,189,248,0.07)");
                rect.setAttribute("stroke", "rgba(56,189,248,0.45)");
                rect.setAttribute("stroke-width", "2");
                rect.setAttribute("stroke-dasharray", "8 5");
                rect.setAttribute("data-object-id", zone.id);
                layer.appendChild(rect);
            });
        },

        renderSpeakers: function () {
            const layer = this.state.speakersLayer;
            if (!layer) return;

            layer.innerHTML = "";

            this.state.objects
                .filter(o => o.type === "speaker")
                .forEach(spk => this.renderSpeaker(layer, spk));
        },

        renderSpeaker: function (layer, spk) {
            const point = this.metersToSvg({ x: spk.x, y: spk.y });
            const specs = readSpeakerSpecs(spk);

            const g = this.createSvg("g");
            g.setAttribute("data-object-id", spk.id);
            g.setAttribute("class", "canvas-speaker");
            g.style.cursor = "pointer";
            g.setAttribute("transform",
                `translate(${point.x},${point.y}) rotate(${spk.rotation || 0})`);

            // Coverage cone
            const h = 55;
            const spread = Math.max(20, Math.min(150, specs.horizontal));
            const half = spread / 2;
            const rad = Math.PI / 180;
            const x1 = Math.sin(-half * rad) * h;
            const y1 = -Math.cos(-half * rad) * h;
            const x2 = Math.sin(half * rad) * h;
            const y2 = -Math.cos(half * rad) * h;
            const largeArc = spread > 180 ? 1 : 0;

            const coverage = this.createSvg("path");
            coverage.setAttribute("d",
                `M 0 0 L ${x1} ${y1} A ${h} ${h} 0 ${largeArc} 1 ${x2} ${y2} Z`);
            coverage.setAttribute("fill", "rgba(230,0,18,0.10)");
            coverage.setAttribute("stroke", "rgba(230,0,18,0.30)");
            coverage.setAttribute("pointer-events", "none");
            g.appendChild(coverage);

            // Body
            const body = this.createSvg("rect");
            body.setAttribute("x", "-14");
            body.setAttribute("y", "-10");
            body.setAttribute("width", "28");
            body.setAttribute("height", "20");
            body.setAttribute("rx", "4");
            body.setAttribute("fill", "#e60012");
            body.setAttribute("stroke", "#fff");
            body.setAttribute("stroke-width", "1.5");
            body.setAttribute("data-object-id", spk.id);
            g.appendChild(body);

            // Direction
            const dir = this.createSvg("line");
            dir.setAttribute("x1", "0");
            dir.setAttribute("y1", "-10");
            dir.setAttribute("x2", "0");
            dir.setAttribute("y2", "-24");
            dir.setAttribute("stroke", "#38bdf8");
            dir.setAttribute("stroke-width", "2");
            dir.setAttribute("pointer-events", "none");
            g.appendChild(dir);

            // Label
            const label = this.createSvg("text");
            label.setAttribute("x", "0");
            label.setAttribute("y", "36");
            label.setAttribute("fill", "#e2e8f0");
            label.setAttribute("font-size", "11");
            label.setAttribute("font-family", "Cairo, sans-serif");
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("pointer-events", "none");
            label.textContent = specs.model;
            g.appendChild(label);

            layer.appendChild(g);
        },

        updateEmptyState: function () {
            const empty = document.getElementById("canvasEmptyState");
            if (!empty) return;
            empty.style.display = this.state.objects.length > 0 ? "none" : "";
        },

        /* ═══════════════ METRICS ═══════════════ */
        updateMetrics: function () {
            const speakers = this.state.objects.filter(o => o.type === "speaker");
            const totalPower = speakers.reduce(
                (s, i) => s + (readSpeakerSpecs(i).rms || 0),
                0
            );

            const count = document.getElementById("metricSpeakerCount");
            if (count) count.textContent = speakers.length;

            const badge = document.getElementById("speakerCountBadge");
            if (badge) badge.textContent = speakers.length;

            const power = document.getElementById("metricTotalPower");
            if (power) power.textContent = totalPower.toFixed(0) + " W";

            // ✅ null check قبل الوصول لـ AcousticApp
            if (window.AcousticApp && typeof window.AcousticApp === "object") {
                window.AcousticApp.canvasMetrics = {
                    speakerCount: speakers.length,
                    totalPower
                };
            }
        },

        /* ═══════════════ DELETE / CLEAR ═══════════════ */
        deleteSelected: function () {
            const id = this.state.selectedId;
            if (!id) return;

            const i = this.state.objects.findIndex(o => o.id === id);
            if (i === -1) return;

            this.pushHistory();
            this.state.objects.splice(i, 1);
            this.state.selectedId = null;

            this.render();
            this.clearInspector();
            this.dispatchChange();
            this.updateStatus("تم حذف العنصر");
        },

        removeSelected: function () { this.deleteSelected(); },

        clear: async function () {
            if (this.state.objects.length === 0) return;

            const ok = await confirmAsync(
                "هل أنت متأكد من مسح جميع العناصر؟",
                "مسح المخطط"
            );
            if (!ok) return;

            this.pushHistory();
            this.state.objects = [];
            this.state.selectedId = null;

            this.render();
            this.clearInspector();
            this.dispatchChange();
            this.updateStatus("تم مسح المخطط");
        },

        /* ═══════════════ ROTATION (مُصلَح) ═══════════════ */
        rotateObject: function (id, degrees) {
            const obj = this.getObjectById(id);
            if (!obj || obj.type !== "speaker") return;

            this.pushHistory();  // ✅ قبل التعديل
            obj.rotation = this.normalizeAngle((Number(obj.rotation) || 0) + Number(degrees));

            this.render();
            this.populateInspector(obj);
            this.dispatchChange();
        },

        rotateSelectedObject: function (degrees) {
            if (!this.state.selectedId) return;
            this.rotateObject(this.state.selectedId, degrees);
        },

        setSelectedSpeakerRotation: function (value) {
            const obj = this.getSelectedObject();
            if (!obj || obj.type !== "speaker") return;

            this.pushHistory();  // ✅ قبل التعديل
            obj.rotation = this.normalizeAngle(Number(value));

            this.render();
            this.populateInspector(obj);
            this.dispatchChange();
        },

        setSelectedSpeakerPosition: function (x, y) {
            const obj = this.getSelectedObject();
            if (!obj || obj.type !== "speaker") return;

            x = Number(x);
            y = Number(y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;

            this.pushHistory();  // ✅ قبل التعديل
            const p = this.clampMeters({ x, y }, 0.15);
            obj.x = Number(p.x.toFixed(3));
            obj.y = Number(p.y.toFixed(3));

            this.render();
            this.populateInspector(obj);
            this.dispatchChange();
        },

        normalizeAngle: function (a) {
            a = Number(a) || 0;
            a = a % 360;
            if (a < 0) a += 360;
            return a;
        },

        /* ═══════════════ HISTORY ═══════════════ */
        pushHistory: function () {
            const snapshot = JSON.stringify(this.state.objects);

            if (this.state.historyIndex < this.state.history.length - 1) {
                this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
            }

            this.state.history.push(snapshot);
            this.state.historyIndex = this.state.history.length - 1;

            if (this.state.history.length > 50) {
                this.state.history.shift();
                this.state.historyIndex--;
            }
        },

        undo: function () {
            if (this.state.historyIndex <= 0) return;
            this.state.historyIndex--;

            try {
                this.state.objects = JSON.parse(this.state.history[this.state.historyIndex]);
            } catch { return; }

            this.state.selectedId = null;
            this.render();
            this.clearInspector();
            this.updateStatus("تم التراجع");
        },

        redo: function () {
            if (this.state.historyIndex >= this.state.history.length - 1) return;
            this.state.historyIndex++;

            try {
                this.state.objects = JSON.parse(this.state.history[this.state.historyIndex]);
            } catch { return; }

            this.render();
            this.updateStatus("تمت الإعادة");
        },

        /* ═══════════════ HELPERS ═══════════════ */
        createSvg: function (tag) {
            return document.createElementNS("http://www.w3.org/2000/svg", tag);
        },

        clearTemporaryGraphics: function () {
            [
                "temporaryWall",
                "temporaryMeasurement",
                "temporaryMeasurementText",
                "temporaryZone"
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        },

        updateStatus: function (msg) {
            const el = document.getElementById("statusMessage")
                    || document.getElementById("analysisStatus");
            if (el) el.textContent = msg;
        },

        refreshCanvas: function () { this.render(); },

        dispatchChange: function () {
            try {
                window.dispatchEvent(new CustomEvent("canvas:changed", {
                    detail: { objects: this.state.objects }
                }));
                // للتوافق مع الكود القديم
                window.dispatchEvent(new CustomEvent("acoustic:change", {
                    detail: { objects: this.state.objects }
                }));
            } catch { /* ignore */ }
        },

        /* ═══════════════ DATA EXPORT/IMPORT ═══════════════ */
        getDesignData: function () {
            return {
                version: "2.0",
                room: JSON.parse(JSON.stringify(this.state.room)),
                objects: JSON.parse(JSON.stringify(this.state.objects)),
                speakers: this.state.objects
                    .filter(o => o.type === "speaker")
                    .map(o => {
                        const specs = readSpeakerSpecs(o);
                        return {
                            id: o.id,
                            speakerId: o.speakerId,
                            type: "speaker",
                            model: specs.model,
                            manufacturer: specs.manufacturer,
                            category: specs.category,
                            x: o.x,
                            y: o.y,
                            z: o.z,
                            rotation: o.rotation,
                            rms_power: specs.rms,
                            max_spl: specs.maxSPL,
                            horizontal_coverage: specs.horizontal,
                            vertical_coverage: specs.vertical,
                            mountingHeight: o.mountingHeight || o.z,
                            gain: o.gain || 0,
                            delay: o.delay || 0
                        };
                    }),
                settings: {
                    zoom: this.state.zoom,
                    snapEnabled: this.state.snapEnabled,
                    gridVisible: this.state.gridVisible
                }
            };
        },

        loadDesign: function (data) {
            if (!data) return;

            if (data.room) {
                this.updateRoom(data.room.width, data.room.depth, data.room.height);
            }

            const objects = data.objects || data.speakers;
            if (Array.isArray(objects)) {
                this.state.objects = objects.map(o => this.normalizeObject(o));
            }

            this.render();
        },

        setGridVisible: function (v) {
            this.state.gridVisible = !!v;
            const g = this.state.grid;
            if (g) g.style.display = v ? "" : "none";
        },

        setSnapEnabled: function (v) {
            this.state.snapEnabled = !!v;
        }
    };

    /* ═══════════════ EXPOSE ═══════════════ */
    window.AcousticCanvas = AcousticCanvas;

    window.initAcousticCanvas = () => AcousticCanvas.init();
    window.setTool = (t) => AcousticCanvas.setTool(t);
    window.updateCanvasRoom = (w, d, h) => AcousticCanvas.updateRoom(w, d, h);
    window.setGridVisible = (e) => AcousticCanvas.setGridVisible(e);
    window.setSnapEnabled = (e) => AcousticCanvas.setSnapEnabled(e);
    window.canvasZoomIn = () => AcousticCanvas.zoomIn();
    window.canvasZoomOut = () => AcousticCanvas.zoomOut();
    window.canvasResetZoom = () => AcousticCanvas.resetZoom();
    window.fitCanvasToRoom = () => AcousticCanvas.fitView();
    window.clearDesignCanvas = () => AcousticCanvas.clear();
    window.deleteSelectedCanvasObject = () => AcousticCanvas.deleteSelected();
    window.rotateSelectedObject = (d) => AcousticCanvas.rotateSelectedObject(d);
    window.setSelectedSpeakerRotation = (v) => AcousticCanvas.setSelectedSpeakerRotation(v);
    window.setSelectedSpeakerPosition = (x, y) => AcousticCanvas.setSelectedSpeakerPosition(x, y);
    window.getDesignData = () => AcousticCanvas.getDesignData();
    window.loadDesignData = (d) => AcousticCanvas.loadDesign(d);
    window.canvasUndo = () => AcousticCanvas.undo();
    window.canvasRedo = () => AcousticCanvas.redo();
    window.refreshCanvas = () => AcousticCanvas.refreshCanvas();

    /* ═══════════════ AUTO INIT ═══════════════ */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => AcousticCanvas.init());
    } else {
        AcousticCanvas.init();
    }

    console.log("[canvas.js] v2.1.0 جاهز");

})();
