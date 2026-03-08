/**
 * ============================================================
 *  GANADERÍA PAMORA — PDF Export Module (report-pdf.js)
 * ============================================================
 *  Uses html2canvas + jsPDF to generate PDF reports
 *  from the rentabilidad dashboard.
 * ============================================================
 */

async function exportarPDF() {
    const btn = document.querySelector('[onclick="exportarPDF()"]');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generando PDF...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        let yPos = margin;

        // ── Header ──
        doc.setFillColor(28, 42, 24); // #1c2a18 (forest-deep)
        doc.rect(0, 0, pageWidth, 35, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('🐄 Ganadería Pamora', margin, 18);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const periodo = document.getElementById('rentabilidad-periodo')?.textContent || 'Reporte';
        doc.text('Reporte de Rentabilidad — ' + periodo, margin, 28);

        yPos = 45;

        // ── KPI Summary ──
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Indicadores Clave', margin, yPos);
        yPos += 8;

        const kpis = [
            { label: 'Ingresos Estimados', value: document.getElementById('kpi-ingresos')?.textContent || '$0' },
            { label: 'Total Gastos', value: document.getElementById('kpi-gastos')?.textContent || '$0' },
            { label: 'Ganancia Neta', value: document.getElementById('kpi-ganancia')?.textContent || '$0' },
            { label: 'Margen', value: document.getElementById('kpi-margen')?.textContent || '0%' },
            { label: 'Costo / Litro', value: document.getElementById('kpi-costo-litro')?.textContent || '$0' },
        ];

        doc.setFontSize(10);
        const colWidth = contentWidth / 3;
        let col = 0;
        let rowY = yPos;

        kpis.forEach((kpi, i) => {
            const x = margin + col * colWidth;

            doc.setFillColor(248, 250, 245); // Very light mint-tinted bg
            doc.roundedRect(x, rowY - 4, colWidth - 4, 18, 4, 4, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 110, 100);
            doc.text(kpi.label, x + 4, rowY + 2);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 102, 0); // #006600 (brand-green)
            doc.setFontSize(12);
            doc.text(kpi.value, x + 4, rowY + 10);
            doc.setFontSize(10);

            col++;
            if (col >= 3) {
                col = 0;
                rowY += 22;
            }
        });

        yPos = rowY + 28;

        // ── Capture Charts ──
        const charts = [
            { id: 'chart-produccion-animal', title: 'Producción Mensual por Animal' },
            { id: 'chart-costo-vs-venta', title: 'Costo por Litro vs Precio de Venta' },
            { id: 'chart-gastos-categoria', title: 'Desglose de Gastos' }
        ];

        for (const chart of charts) {
            const canvas = document.getElementById(chart.id);
            if (!canvas) continue;

            // Title
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(chart.title, margin, yPos);
            yPos += 5;

            // Capture canvas as image
            const imgData = canvas.toDataURL('image/png', 1.0);
            const imgWidth = contentWidth;
            const imgHeight = (canvas.height / canvas.width) * imgWidth;

            // Check if we need a new page
            if (yPos + imgHeight > doc.internal.pageSize.getHeight() - margin) {
                doc.addPage();
                yPos = margin;
                doc.setTextColor(30, 30, 30);
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(chart.title, margin, yPos);
                yPos += 5;
            }

            doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, Math.min(imgHeight, 90));
            yPos += Math.min(imgHeight, 90) + 12;
        }

        // ── Footer ──
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `Ganadería Pamora — Generado el ${new Date().toLocaleDateString('es-CO')} — Página ${i}/${totalPages}`,
                margin,
                doc.internal.pageSize.getHeight() - 8
            );
        }

        // ── Save ──
        const now = new Date();
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const fileName = `Pamora_Reporte_${monthNames[now.getMonth()]}${now.getFullYear()}.pdf`;
        doc.save(fileName);

        showToast('📄 Reporte PDF descargado: ' + fileName, 'success');

    } catch (error) {
        console.error('Error generando PDF:', error);
        showToast('Error al generar el PDF: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}
