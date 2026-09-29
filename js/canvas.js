/* ============================================================
   Acoustic Engineering — js/canvas.js
   Interactive Engineering Canvas (SVG-based)
   Version 2.0 — Compatible with app.html v1.0
   ============================================================ */
(function () {
    "use strict";
    window.AcousticEngineering = window.AcousticEngineering || {};
    const AE = window.AcousticEngineering;

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
            measureStart: null,
            wallStart: null,
            zoneStart: null,
            currentPointer: null,
            objects: [],
            history: [],
            historyIndex: -1,
            room: { width: 12, depth: 8, height: 3 },
            svg: null,
            container: null,
            roomRect: null,
            grid: null,
            speakersLayer: null,
            wallsLayer: null,
            zonesLayer: null,
            measurementLayer: null,
            coverageLayer: null,
            selectionLayer: null,
            cursorPoint: null,
            cursorCoordinates: null,
            viewBox: { x: 0, y: 0, width: 1000, height: 700 },
            pixelsPerMeter: 60
        },

        /* =========================================================
           INITIALIZATION
        ========================================================= */
        init: function () {
            if (this.state.initialized) return;
            this.cacheElements();

            if (!this.state.svg) {
                console.warn("AcousticCanvas: SVG element not found");
                return;
            }

            // إخفاء حالة "ابدأ التصميم" عند وجود عناصر
            const emptyState = document.getElementById("canvasEmptyState");
            if (emptyState) emptyState.style.display = "";

            this.state.initialized = true;
            this.bindEvents();
            this.updateRoom(
                this.state.room.width,
                this.state.room.depth,
                this.state.room.height
            );
            this.render();
            this.updateEmptyState();
        },

        /* =========================================================
           CACHE DOM ELEMENTS (supports both IDs)
        ========================================================= */
        cacheElements: function () {
            const s = this.state;

            // SVG root — يقبل كلا المعرفين
            s.svg =
                document.getElementById("engineeringCanvas") ||
                document.getElementById("designSvg");

            // Container
            s.container =
                document.querySelector(".canvas-stage") ||
                document.getElementById("canvasContainer") ||
                (s.svg ? s.svg.parentElement : null);

            // Room rect — يُنشَأ إن لم يوجد
            s.roomRect = document.getElementById("roomRect");

            // Grid
            s.grid =
                document.getElementById("gridLayer") ||
                document.getElementById("canvasGrid");

            // Layers — mapping دقيق مع بنية app.html
            s.wallsLayer =
                document.getElementById("roomLayer") ||
                document.getElementById("wallsLayer");
            s.speakersLayer =
                document.getElementById("objectLayer") ||
                document.getElementById("speakersLayer");
            s.coverageLayer =
                document.getElementById("coverageLayer");
            s.measurementLayer =
                document.getElementById("measurementLayer");
            s.selectionLayer =
                document.getElementById("selectionLayer");
            s.zonesLayer =
                document.getElementById("zonesLayer");

            // Fallback: إن لم توجد أي طبقات، استخدم SVG نفسه
            if (!s.wallsLayer) s.wallsLayer = s.svg;
            if (!s.speakersLayer) s.speakersLayer = s.svg;
            if (!s.coverageLayer) s.coverageLayer = s.svg;
            if (!s.measurementLayer) s.measurementLayer = s.svg;
            if (!s.selectionLayer) s.selectionLayer = s.svg;
            if (!s.zonesLayer) s.zonesLayer = s.svg;

            // Cursor coordinates
            s.cursorCoordinates = document.getElementById("cursorCoordinates");
            s.cursorPoint = document.getElementById("cursorPoint");
        },

        /* =========================================================
           EVENT BINDING
        ========================================================= */
        bindEvents: function () {
            const s = this.state;
            if (!s.svg) return;

            s.svg.addEventListener("pointerdown", this.onPointerDown.bind(this));
            s.svg.addEventListener("pointermove", this.onPointerMove.bind(this));
            s.svg.addEventListener("pointerup", this.onPointerUp.bind(this));
            s.svg.addEventListener("pointercancel", this.onPointerUp.bind(this));
            s.svg.addEventListener("wheel", this.onWheel.bind(this), { passive: false });
            s.svg.addEventListener("dblclick", this.onDoubleClick.bind(this));
            s.svg.addEventListener("contextmenu", (e) => e.preventDefault());

            window.addEventListener("resize", this.refreshCanvas.bind(this));
        },

        /* =========================================================
           TOOL MANAGEMENT
        ========================================================= */
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

            // Update cursor class
            if (this.state.svg) {
                this.state.svg.style.cursor = this.getCursorForTool(tool);
            }

            this.updateStatus(this.getToolLabel(tool));
        },

        getCursorForTool: function (tool) {
            const cursors = {
                select: "default",
                wall: "crosshair",
                speaker: "copy",
                measure: "crosshair",
                zone: "crosshair",
                pan: "grab"
            };
            return cursors[tool] || "default";
        },

        getToolLabel: function (tool) {
            const labels = {
                select: "وضع التحديد",
                wall: "رسم الجدران",
                speaker: "إضافة سماعة — اضغط داخل المخطط",
                measure: "وضع القياس — اضغط نقطتين",
                zone: "رسم منطقة — اضغط واسحب",
                pan: "تحريك العرض"
            };
            return labels[tool] || "وضع التصميم";
        },

        /* =========================================================
           ROOM
        ========================================================= */
        updateRoom: function (width, depth, height) {
            width = Number(width) || 12;
            depth = Number(depth) || 8;
            height = Number(height) || 3;

            this.state.room = { width: width, depth: depth, height: height };

            const svg = this.state.svg;
            if (!svg) return;

            // تأكد من وجود roomRect
            let rect = this.state.roomRect || document.getElementById("roomRect");
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

            // حساب الأبعاد داخل الـ viewBox
            const vb = svg.viewBox.baseVal;
            const vbW = vb.width || 1000;
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

            this.state.pixelsPerMeter = roomW / width;

            // رسم حدود الفراغ فقط
            this.render();
        },

        /* =========================================================
           COORDINATE TRANSFORMS
        ========================================================= */
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

        /* =========================================================
           POINTER EVENTS
        ========================================================= */
        onPointerDown: function (event) {
            if (event.button !== 0 && event.pointerType !== "touch") return;

            this.state.currentPointer = event;

            const svgPoint = this.screenToSvg(event);
            const meterPoint = this.clampMeters(this.svgToMeters(svgPoint));

            // Shift = pan
            if (event.shiftKey) {
                this.startPan(event);
                return;
            }

            // Tool: Pan
            if (this.state.tool === "pan") {
                this.startPan(event);
                return;
            }

            // Tool: Select
            if (this.state.tool === "select") {
                const target = event.target;
                const el = target.closest ? target.closest("[data-object-id]") : null;

                if (el) {
                    this.selectObject(el.getAttribute("data-object-id"));
                    this.startDrag(event);
                } else {
                    this.clearSelection();
                }
                return;
            }

            // Tool: Speaker
            if (this.state.tool === "speaker") {
                this.addSpeakerAt(meterPoint);
                return;
            }

            // Tool: Wall
            if (this.state.tool === "wall") {
                this.startWall(meterPoint);
                return;
            }

            // Tool: Measure
            if (this.state.tool === "measure") {
                this.startMeasurement(meterPoint);
                return;
            }

            // Tool: Zone
            if (this.state.tool === "zone") {
                this.startZone(meterPoint);
                return;
            }
        },

        onPointerMove: function (event) {
            this.state.currentPointer = event;
            this.updateCoordinates(event);

            if (this.state.dragging) {
                this.dragSelectedObject(event);
                return;
            }

            if (this.state.panning) {
                this.panMove(event);
                return;
            }

            if (this.state.drawing && this.state.tool === "wall") {
                this.previewWall(event);
                return;
            }

            if (this.state.measuring) {
                this.previewMeasurement(event);
                return;
            }

            if (this.state.drawing && this.state.tool === "zone") {
                this.previewZone(event);
                return;
            }
        },

        onPointerUp: function (event) {
            if (this.state.dragging) this.finishDrag();
            if (this.state.panning) this.finishPan();

            if (this.state.drawing && this.state.tool === "wall") {
                this.finishWall(event);
            }
            if (this.state.measuring) {
                this.finishMeasurement(event);
            }
            if (this.state.drawing && this.state.tool === "zone") {
                this.finishZone(event);
            }
        },

        onDoubleClick: function (event) {
            const target = event.target;
            const el = target.closest ? target.closest("[data-object-id]") : null;
            if (!el) return;

            const obj = this.getObjectById(el.getAttribute("data-object-id"));
            if (obj && obj.type === "speaker") {
                this.rotateObject(obj.id, 15);
            }
        },

        onWheel: function (event) {
            event.preventDefault();
            const direction = event.deltaY < 0 ? 1 : -1;
            const factor = direction > 0 ? 1.12 : 0.89;
            this.setZoom(this.state.zoom * factor);
        },

        /* =========================================================
           COORDINATES DISPLAY
        ========================================================= */
        updateCoordinates: function (event) {
            if (!event) {
                if (this.state.currentPointer) {
                    event = this.state.currentPointer;
                } else {
                    return;
                }
            }

            const svgPoint = this.screenToSvg(event);
            let meterPoint = this.svgToMeters(svgPoint);
            meterPoint = this.clampMeters(meterPoint);

            if (this.state.cursorCoordinates) {
                this.state.cursorCoordinates.textContent =
                    "X: " + meterPoint.x.toFixed(2) + "m | Y: " + meterPoint.y.toFixed(2) + "m";
            }
        },

        /* =========================================================
           SELECTION
        ========================================================= */
        selectObject: function (id) {
            const obj = this.getObjectById(id);
            if (!obj) return;

            this.state.selectedId = id;
            this.state.selectedType = obj.type;
            this.renderSelection();
            this.populateInspector(obj);
            this.updateStatus("تم تحديد: " + (obj.model || obj.type));
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
            return this.state.objects.find(function (o) { return o.id === id; }) || null;
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

        /* =========================================================
           INSPECTOR
        ========================================================= */
        populateInspector: function (obj) {
            const info = document.getElementById("selectionInfo");
            const empty = document.getElementById("selectionEmpty");

            if (info) info.style.display = "";
            if (empty) empty.style.display = "none";

            const name = document.getElementById("selectedObjectName");
            if (name) name.textContent = obj.model || obj.name || obj.type || "Object";

            const type = document.getElementById("selectedObjectType");
            if (type) type.textContent = (obj.type || "").toUpperCase();

            const power = document.getElementById("speakerPower");
            if (power && obj.power) power.value = obj.power;

            const spl = document.getElementById("speakerSPL");
            if (spl && obj.maxSPL) spl.value = obj.maxSPL;

            const model = document.getElementById("speakerModel");
            if (model) model.value = obj.model || "";

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

        /* =========================================================
           SPEAKER — ADD
        ========================================================= */
        addSpeakerAt: function (point) {
            point = this.snapPoint(point);
            point = this.clampMeters(point, 0.15);

            const mountingHeight = Math.max(
                2.2,
                this.state.room.height - 0.2
            );

            const speaker = {
                id: "SPK-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
                type: "speaker",
                name: "Speaker",
                model: "Custom Speaker",
                x: Number(point.x.toFixed(3)),
                y: Number(point.y.toFixed(3)),
                z: mountingHeight,
                rotation: 0,
                power: 500,
                rms: 500,
                maxSPL: 125,
                horizontal: 90,
                vertical: 60,
                horizontalCoverage: 90,
                verticalCoverage: 60,
                mountingHeight: mountingHeight
            };

            this.pushHistory();
            this.state.objects.push(speaker);
            this.selectObject(speaker.id);
            this.render();
            this.updateMetrics();
            this.updateStatus("✓ تمت إضافة السماعة — " + this.state.objects.filter(o => o.type === "speaker").length + " سماعة");
            this.dispatchChange();

            return speaker;
        },

        /* =========================================================
           DRAG
        ========================================================= */
        startDrag: function (event) {
            const obj = this.getSelectedObject();
            if (!obj) return;

            this.state.dragging = true;
            this.state.dragStart = {
                eventX: event.clientX,
                eventY: event.clientY,
                objectX: obj.x,
                objectY: obj.y
            };

            try {
                this.state.svg.setPointerCapture(event.pointerId);
            } catch (e) {}
        },

        dragSelectedObject: function (event) {
            const obj = this.getSelectedObject();
            const start = this.state.dragStart;
            if (!obj || !start) return;

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
            if (this.state.dragging) this.pushHistory();
            this.state.dragging = false;
            this.state.dragStart = null;
            this.dispatchChange();
        },

        /* =========================================================
           WALL TOOL
        ========================================================= */
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

            const d = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            this.updateStatus("طول الجدار: " + d.toFixed(2) + " m");
        },

        finishWall: function (event) {
            if (!this.state.wallStart) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.snapPoint(this.svgToMeters(svgPoint));
            end = this.clampMeters(end);

            const start = this.state.wallStart;
            const d = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

            if (d < 0.05) {
                this.cancelWall();
                return;
            }

            this.pushHistory();

            const wall = {
                id: "WALL-" + Date.now(),
                type: "wall",
                x1: Number(start.x.toFixed(3)),
                y1: Number(start.y.toFixed(3)),
                x2: Number(end.x.toFixed(3)),
                y2: Number(end.y.toFixed(3)),
                height: this.state.room.height,
                thickness: 0.15
            };

            this.state.objects.push(wall);
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

        /* =========================================================
           MEASURE TOOL
        ========================================================= */
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

            const d = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

            text.setAttribute("x", (a.x + b.x) / 2);
            text.setAttribute("y", (a.y + b.y) / 2 - 10);
            text.textContent = d.toFixed(2) + " m";
        },

        finishMeasurement: function (event) {
            const start = this.state.measureStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.clampMeters(this.svgToMeters(svgPoint));

            const d = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

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

        /* =========================================================
           ZONE TOOL
        ========================================================= */
        startZone: function (point) {
            this.state.zoneStart = this.clampMeters(point);
            this.state.drawing = true;
            this.updateStatus("حدد الزاوية المقابلة للمنطقة");
        },

        previewZone: function (event) {
            const start = this.state.zoneStart;
            if (!start) return;

            const svgPoint = this.screenToSvg(event);
            let end = this.clampMeters(this.svgToMeters(svgPoint));

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
            let end = this.clampMeters(this.svgToMeters(svgPoint));

            const w = Math.abs(end.x - start.x);
            const d = Math.abs(end.y - start.y);

            if (w < 0.1 || d < 0.1) {
                this.cancelZone();
                return;
            }

            this.pushHistory();

            const zone = {
                id: "ZONE-" + Date.now(),
                type: "zone",
                name: "منطقة صوتية",
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: w,
                depth: d
            };

            this.state.objects.push(zone);
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

        /* =========================================================
           PAN
        ========================================================= */
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

        /* =========================================================
           ZOOM
        ========================================================= */
        setZoom: function (zoom) {
            zoom = Number(zoom) || 1;
            zoom = Math.max(this.state.minZoom, Math.min(this.state.maxZoom, zoom));
            this.state.zoom = zoom;
            this.applyTransform();

            const label = document.getElementById("zoomLevel") ||
                          document.getElementById("canvasZoomValue") ||
                          document.getElementById("zoomLabel");
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

        fitView: function () { this.resetZoom(); },

        applyTransform: function () {
            const svg = this.state.svg;
            if (!svg) return;
            svg.style.transformOrigin = "center center";
            svg.style.transform =
                "translate(" + this.state.panX + "px, " + this.state.panY + "px) scale(" + this.state.zoom + ")";
        },

        /* =========================================================
           RENDER
        ========================================================= */
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

            // نحتفظ بالـ roomRect و preview
            layer.innerHTML = "";
            if (roomRect && roomRect.parentElement !== layer) {
                layer.appendChild(roomRect);
            } else if (roomRect) {
                layer.appendChild(roomRect);
            }

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

            if (preview) layer.appendChild(preview);
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

            const speakers = this.state.objects.filter(o => o.type === "speaker");
            speakers.forEach(spk => this.renderSpeaker(layer, spk));
        },

        renderSpeaker: function (layer, spk) {
            const point = this.metersToSvg({ x: spk.x, y: spk.y });

            const g = this.createSvg("g");
            g.setAttribute("data-object-id", spk.id);
            g.setAttribute("class", "canvas-speaker");
            g.style.cursor = "pointer";
            g.setAttribute("transform",
                "translate(" + point.x + "," + point.y + ") rotate(" + (spk.rotation || 0) + ")");

            // Coverage cone
            const coverage = this.createSvg("path");
            const h = 55;
            const spread = Math.max(20, Math.min(150, spk.horizontal || spk.horizontalCoverage || 90));
            const half = spread / 2;
            const rad = Math.PI / 180;
            const x1 = Math.sin(-half * rad) * h;
            const y1 = -Math.cos(-half * rad) * h;
            const x2 = Math.sin(half * rad) * h;
            const y2 = -Math.cos(half * rad) * h;
            const largeArc = spread > 180 ? 1 : 0;

            coverage.setAttribute("d",
                "M 0 0 L " + x1 + " " + y1 +
                " A " + h + " " + h + " 0 " + largeArc + " 1 " + x2 + " " + y2 + " Z");
            coverage.setAttribute("fill", "rgba(230,0,18,0.10)");
            coverage.setAttribute("stroke", "rgba(230,0,18,0.30)");
            coverage.setAttribute("pointer-events", "none");
            g.appendChild(coverage);

            // Speaker body
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

            // Direction indicator
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
            label.textContent = spk.model || "Speaker";
            g.appendChild(label);

            layer.appendChild(g);
        },

        /* =========================================================
           EMPTY STATE
        ========================================================= */
        updateEmptyState: function () {
            const empty = document.getElementById("canvasEmptyState");
            if (!empty) return;

            const hasObjects = this.state.objects.length > 0;
            empty.style.display = hasObjects ? "none" : "";
        },

        /* =========================================================
           METRICS
        ========================================================= */
        updateMetrics: function () {
            const speakers = this.state.objects.filter(o => o.type === "speaker");
            const totalPower = speakers.reduce((s, i) => s + (Number(i.power) || 0), 0);

            const count = document.getElementById("metricSpeakerCount");
            if (count) count.textContent = speakers.length;

            const badge = document.getElementById("speakerCountBadge");
            if (badge) badge.textContent = speakers.length;

            const power = document.getElementById("metricTotalPower");
            if (power) power.textContent = totalPower.toFixed(0) + " W";

            if (window.AcousticApp) {
                window.AcousticApp.canvasMetrics = {
                    speakerCount: speakers.length,
                    totalPower: totalPower
                };
            }
        },

        /* =========================================================
           DELETE / CLEAR
        ========================================================= */
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

        clear: function () {
            if (!confirm("هل أنت متأكد من مسح جميع العناصر؟")) return;

            this.pushHistory();
            this.state.objects = [];
            this.state.selectedId = null;

            this.render();
            this.clearInspector();
            this.dispatchChange();
            this.updateStatus("تم مسح المخطط");
        },

        /* =========================================================
           ROTATION
        ========================================================= */
        rotateObject: function (id, degrees) {
            const obj = this.getObjectById(id);
            if (!obj || obj.type !== "speaker") return;

            this.pushHistory();
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

            this.pushHistory();
            const p = this.clampMeters({ x: x, y: y }, 0.15);
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

        /* =========================================================
           HISTORY
        ========================================================= */
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
            } catch (e) { return; }

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
            } catch (e) { return; }

            this.render();
            this.updateStatus("تمت الإعادة");
        },

        /* =========================================================
           HELPERS
        ========================================================= */
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
            const el = document.getElementById("statusMessage") ||
                       document.getElementById("analysisStatus");
            if (el) el.textContent = msg;
        },

        refreshCanvas: function () { this.render(); },

        dispatchChange: function () {
            try {
                window.dispatchEvent(new CustomEvent("acoustic:change", {
                    detail: { objects: this.state.objects }
                }));
            } catch (e) {}
        },

        /* =========================================================
           DATA EXPORT / IMPORT
        ========================================================= */
        getDesignData: function () {
            return {
                version: "1.0",
                room: JSON.parse(JSON.stringify(this.state.room)),
                objects: JSON.parse(JSON.stringify(this.state.objects)),
                speakers: this.state.objects
                    .filter(o => o.type === "speaker")
                    .map(o => ({
                        id: o.id,
                        type: "speaker",
                        model: o.model,
                        manufacturer: o.manufacturer,
                        x: o.x,
                        y: o.y,
                        z: o.z,
                        rotation: o.rotation,
                        power: o.power,
                        rms: o.rms,
                        maxSPL: o.maxSPL,
                        horizontalCoverage: o.horizontal || o.horizontalCoverage,
                        verticalCoverage: o.vertical || o.verticalCoverage,
                        mountingHeight: o.mountingHeight || o.z
                    })),
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
                this.state.objects = JSON.parse(JSON.stringify(objects));
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

    /* =========================================================
       EXPOSE GLOBALLY
    ========================================================= */
    window.AcousticCanvas = AcousticCanvas;

    window.initAcousticCanvas = function () { AcousticCanvas.init(); };
    window.setTool = function (t) { AcousticCanvas.setTool(t); };
    window.updateCanvasRoom = function (w, d, h) { AcousticCanvas.updateRoom(w, d, h); };
    window.setGridVisible = function (e) { AcousticCanvas.setGridVisible(e); };
    window.setSnapEnabled = function (e) { AcousticCanvas.setSnapEnabled(e); };
    window.canvasZoomIn = function () { AcousticCanvas.zoomIn(); };
    window.canvasZoomOut = function () { AcousticCanvas.zoomOut(); };
    window.canvasResetZoom = function () { AcousticCanvas.resetZoom(); };
    window.fitCanvasToRoom = function () { AcousticCanvas.fitView(); };
    window.clearDesignCanvas = function () { AcousticCanvas.clear(); };
    window.deleteSelectedCanvasObject = function () { AcousticCanvas.deleteSelected(); };
    window.rotateSelectedObject = function (d) { AcousticCanvas.rotateSelectedObject(d); };
    window.setSelectedSpeakerRotation = function (v) { AcousticCanvas.setSelectedSpeakerRotation(v); };
    window.setSelectedSpeakerPosition = function (x, y) { AcousticCanvas.setSelectedSpeakerPosition(x, y); };
    window.getDesignData = function () { return AcousticCanvas.getDesignData(); };
    window.loadDesignData = function (d) { AcousticCanvas.loadDesign(d); };
    window.canvasUndo = function () { AcousticCanvas.undo(); };
    window.canvasRedo = function () { AcousticCanvas.redo(); };
    window.refreshCanvas = function () { AcousticCanvas.refreshCanvas(); };

    /* =========================================================
       AUTO INIT
    ========================================================= */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            AcousticCanvas.init();
        });
    } else {
        AcousticCanvas.init();
    }
})();