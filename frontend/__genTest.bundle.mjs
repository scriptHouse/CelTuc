// src/__genTest.tsx
import { writeFileSync } from "node:fs";
import ReactPDF from "@react-pdf/renderer";

// src/documentos/RecepcionPdf.tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// src/documentos/assets.ts
var LOGO_CELTUC = "data:image/jpeg;base64,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";
var ICON_INSTAGRAM = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA3ADcAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAAaABsDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9hf2zv27NH/ZMg0vS7XSbrxh458QSRppfh2ylKTzq0mzzHYK5RS2VQBGaRxtUYDsnyo3/AAUL/a/MwYfBKMADGz/hDNYwff8A12f1ryX4kfF3XLH9qn9pXxdBdbfE2gWl3ZaZqCQotxpyf2xYaWGhYDMcq2cjxCRcOAzHdkk1X+HfwJ+Hc/xm8M/DK78N6trXibVLaz1Z/Eo1fzNNaabTUvlha0jiDPYguoldZklKB3WRBhR9Jgc4yvB01TlRjUk7XcrvXsldJJd9316I/o2j4L4Ojg1WxtSTkqftJcqvZKEak5Wc4e7CM4LeU5Nu0ND7o/Yk/wCCjtj+0r4huvBfi3RW8C/EjTMpJpVw7KmoNGn77yQ4V0kRlctA+XVBkM4WQp9OV+LHxP8Aj5reieOvgz8UoW/4qBdJfU3VZ5sTCHXNTRYGkZ2laLyESD53ZjEoUkiv2nrzsz+qykq2EXLGW8b35X5N62e6ufnniLwFLhyWHqK/LV9pGzd7TpT5JpPS6vZp26nxH+0L+yBp/wAK/jJ4u8Vf2G+r+CfiNE8Gux2zMLrT5JZ4bh5kZmILG6iSZd3yEkxkKNpPmet6pFpPwkuPBrfEf4hQ+HZoTbtar4dtmYQlQpgWQ33mLCVABiDBCMgryc/pJcKHTDAEHgg968t+JPwn8KvLGG8M+H2BHIOnQ8/+O1/N3iBk+My7GLG4TEvlqNvlfN7t2nJKUZwbi3qoyTUXe2jsfWcH8b4rHRhh8aud0uSzvF35VaErThNKcUrcys2kr6q5+SPx3t9J1PVvD+n6DDqUfh/wjo/9k2kmolBc3pa6uLuWV0TKx5lupAqBmwirlmOTX7iV8z618CPA9yzGTwb4UkPq2kW5/wDZK+mK/RuCcVisTSnVxU+Z2jayslo/Nm/jZnSxuGy6koOPJ7XVy5nJycJSbdlq3dt9W+h//9k=";
var ICON_FACEBOOK = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA3ADcAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAAaABoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9Ov8Agq//AMFSo/8Agn74c0bSfD+m6b4g8feJFee3tbyb/RtMtUIBuJ40YSsHbKRqCgYpKd48va35zfs1eMf2wv8AgqH8TtSbw18WPEtidBt4V1K/XXZNB0uxDeaYQ8FkqhnkMcgykLE4+YhQDXNf8FxdZvNS/wCCmfxBgurq6uIdOh0y3tI5ZmdbWI6bbSmOME4RTJJI+1cDdIxxliT9uf8ABPr4ffAHQP8AglV4+uLPxv4mtNC8SaZBD8RtXit3W80e7azhW5tID9ly8KGZ1XCTDEz/ADNkmv12hgsNlOS0cTTpKdaty+84c9ua3TyTsldcz77H5zUxlfMMzqUZTcadPm0UuW/Lfr5tavoin+zZ/wAFVfHf7LX7XerfAn9prX/Dut3MV1bwweMNPRbe106Wa3jmSOfEMKtAwkjHmmNDE5cuXjO+P9MK/mD/AGofDvw98J/HfXrD4V65qnibwDbtB/ZWpalGUubkGCNpd6tFCflmMijMa8KOvU/0ZfsgeNNU+IX7Jfwu1/WruS/1nXPCOk6hf3LqqtcXEtnFJJIQoABZ2Y4AA54ArwOOMlw+Ep0MZQXL7RWkrcutk78v2b63j09bnscL5pVxEquHqu/K9Hfm0vtzdbdH1Pgv/gu1/wAE0vEfxd8Sab8Wvhv4cute1XyF0/xNp2mwiS8uVTC293HCib5mCkxSYZnCJb4TakjL8s/softc/Dz4af8ABKT41/DbW/EH2Pxp4wv3n0jThY3Mv2tDDaqD5qRtEnMb/fdfu+4r95CMivPviF+yv8MPiz4ofWPFXw38B+JtWaJIje6r4ftLy4KLnavmSRs2B2GcCqyPiSdXDQyzEx5owalFp2a5XdJ3TuunTTQnNcljTryx1CVnJNNNXXvKza1Vn9+p/MG71/S/+wcP+MHPgz/2Iuif+m+CnH9gn4Fn/mi/wn/8JHT/AP41XqHh/wAP2HhbQbHTNMsbPTtN063jtbS0tYVhgtYUUKkcaKAqoqgAKAAAABWnHmb/AF7D0ocnLaTe9+noiOFcu+rVZy5r3S6W6+rP/9k=";

// src/documentos/content.ts
var EMPRESA = {
  nombre: "CELTUC",
  direccion: "Salta 186 - Yerba Buena",
  instagram: "@CelTuc",
  facebook: "/CelTuc"
};
var RECEPCION_TITULO = "RECEPCION DE EQUIPO/S";
var LABELS = {
  cupon: "CUPON N\xB0",
  fecha: "FECHA",
  recibiDe: "RECIBI DE",
  equipos: "EL EQUIPO/S",
  falla: "CON LA SIGUIENTE FALLA/S",
  obs: "OBS:",
  recepciono: "RECEPCIONO:",
  codDesbloqueo: "COD. DESBLOQUEO:",
  tel: "TEL:",
  presupuesto: "PRESUPUESTO:",
  sena: "SE\xD1A:",
  pendiente: "PENDIENTE:",
  diagnostico: "DIAGNOSTICO TECNICO:"
};
var GARANTIA_RUNS = [
  {
    t: "Documento v\xE1lido como garant\xEDa. \nLa garant\xEDa s\xF3lo podr\xE1 ser reclamada por la persona que aparece en la orden, presentando una identificaci\xF3n oficial. El tiempo para validar si procede o no con la garant\xEDa es de hasta tres (3) d\xEDas. Si la garant\xEDa aplica, la reparaci\xF3n de \xE9sta puede demorar hasta 10 d\xEDas h\xE1biles dependiendo de la disponibilidad de la pieza. \nLos cambios de bater\xEDa cuentan con sesenta (60) d\xEDas de garant\xEDa, mientras que el resto de las reparaciones (modulo-placa-pin de carga-c\xE1mara-etc.) cuenta con noventa (90) d\xEDas de garant\xEDa, el plazo de la misma comienza a contar desde el d\xEDa que se hace entrega del equipo reparado.\n"
  },
  { t: "Esta garant\xEDa NO cubre:", bold: true },
  {
    t: "\nReembolsos/devoluciones; si el equipo supera el plazo de garant\xEDa; software ;da\xF1os, roturas, golpes, irregularidades y/o vicios aparentes de f\xE1cil e inmediata observaci\xF3n que no fueron registrados en la hoja de recepci\xF3n del equipo; da\xF1os por fluidos; si fue utilizado con alg\xFAn accesorio que no pertenece al celular, por ejemplo un cargador de otra marca; si se utiliz\xF3 alg\xFAn software no autorizado por el fabricante; defectos o da\xF1os ocasionados por testeos, instalaciones, alteraciones y/o modificaci\xF3n de cualquier tipo realizado por otro servicio t\xE9cnico; robo o hurto del equipo; los equipos que no sean retirados en un plazo de treinta (30) d\xEDas desde que el cliente fue notificado para retirar el mismo, ser\xE1n enviados a un deposito.\n"
  }
];
var GARANTIA_TEXTO = GARANTIA_RUNS.map((r) => r.t).join("");

// src/documentos/layout.ts
var NATURAL_W = 498;
var COLS = { A: 11, B: 80, C: 59, D: 85, E: 53, F: 91, G: 31, H: 35, I: 32, J: 21 };
var PAD_L = COLS.A;
var PAD_R = COLS.J;
var CONTENT_W = COLS.B + COLS.C + COLS.D + COLS.E + COLS.F + COLS.G + COLS.H + COLS.I;
var LEFT_BOX_W = COLS.B + COLS.C + COLS.D;
var GAP_W = COLS.E;
var RIGHT_BOX_W = COLS.F + COLS.G + COLS.H + COLS.I;
var RIGHT_CLUSTER_W = RIGHT_BOX_W;
var LABEL_F_W = COLS.F;
var DATE_BOX = [COLS.G, COLS.H, COLS.I];
var H = {
  title: 26.8,
  // fila 1
  header: 79.8,
  // filas 2–6 (logo + datos + cupón/fecha)
  line: 18.8,
  // cada renglón rellenable (filas 7–10)
  spacer: 18.8,
  // filas vacías 11, 14, 18
  obsRow: 18.8,
  // filas 12–13 (OBS, 2 renglones)
  infoRow: 18.8,
  // filas 15–17
  diagRow: 18.8,
  // filas 19–20
  gSpacer: 16,
  // fila 21
  garantiaRow: 20,
  // filas 22–30
  garantiaLast: 28,
  // fila 31
  bottom: 9.53
  // fila 32 (cierre del marco)
};
var FONT = {
  title: 18.7,
  // 14 pt
  celtuc: 21.3,
  // 16 pt
  address: 10.7,
  // 8 pt
  social: 12,
  // 9 pt
  body: 14.7,
  // 11 pt
  warranty: 9.3
  // 7 pt
};
var FRAME = 2;
var BOX = 1.5;
var LOGO = 64;
var SOCIAL_ICON = 14;

// src/documentos/RecepcionPdf.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var INK = "#0a0a0b";
var REG = "Helvetica";
var BOLD = "Helvetica-Bold";
var s = StyleSheet.create({
  page: { backgroundColor: "#fff", paddingHorizontal: (595.28 - NATURAL_W) / 2, paddingVertical: 96 },
  paper: { width: NATURAL_W, borderWidth: FRAME, borderColor: INK, color: INK, fontFamily: REG },
  title: {
    height: H.title,
    borderBottomWidth: FRAME,
    borderColor: INK,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row"
  },
  titleText: { fontSize: FONT.title, fontFamily: BOLD, letterSpacing: 0.3 },
  body: { paddingLeft: PAD_L, paddingRight: PAD_R },
  row: { flexDirection: "row" }
});
function RecepcionPdf({ datos: datos2 }) {
  return /* @__PURE__ */ jsx(Document, { title: "Recepci\xF3n de equipos \u2014 CelTuc", author: "CelTuc", children: /* @__PURE__ */ jsx(Page, { size: "A4", style: s.page, children: /* @__PURE__ */ jsxs(View, { style: s.paper, children: [
    /* @__PURE__ */ jsx(View, { style: s.title, children: /* @__PURE__ */ jsx(Text, { style: s.titleText, children: RECEPCION_TITULO }) }),
    /* @__PURE__ */ jsxs(View, { style: s.body, children: [
      /* @__PURE__ */ jsx(Header, { datos: datos2 }),
      /* @__PURE__ */ jsx(Line, { label: LABELS.recibiDe, value: datos2.recibiDe }),
      /* @__PURE__ */ jsx(Line, { label: LABELS.equipos, value: datos2.equipos }),
      /* @__PURE__ */ jsx(Line, { label: LABELS.falla, value: datos2.falla }),
      /* @__PURE__ */ jsx(Line, { label: "", value: datos2.fallaExtra }),
      /* @__PURE__ */ jsx(View, { style: { height: H.spacer } }),
      /* @__PURE__ */ jsxs(View, { style: { borderWidth: BOX, borderColor: INK, minHeight: H.obsRow * 2, flexDirection: "row" }, children: [
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, fontFamily: BOLD, paddingVertical: 2, paddingHorizontal: 4 }, children: LABELS.obs }),
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, flex: 1, paddingTop: 2, paddingRight: 2 }, children: datos2.obs })
      ] }),
      /* @__PURE__ */ jsx(View, { style: { height: H.spacer } }),
      /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", gap: GAP_W }, children: [
        /* @__PURE__ */ jsxs(View, { style: { width: LEFT_BOX_W, borderWidth: BOX, borderColor: INK }, children: [
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.recepciono, value: datos2.recepciono, divider: true }),
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.codDesbloqueo, value: datos2.codDesbloqueo, divider: true }),
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.tel, value: datos2.tel })
        ] }),
        /* @__PURE__ */ jsxs(View, { style: { width: RIGHT_BOX_W, borderWidth: BOX, borderColor: INK }, children: [
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.presupuesto, value: datos2.presupuesto, divider: true }),
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.sena, value: datos2.sena, divider: true }),
          /* @__PURE__ */ jsx(InfoRow, { label: LABELS.pendiente, value: datos2.pendiente })
        ] })
      ] }),
      /* @__PURE__ */ jsx(View, { style: { height: H.spacer } }),
      /* @__PURE__ */ jsxs(View, { style: { borderWidth: BOX, borderColor: INK, minHeight: H.diagRow * 2 }, children: [
        /* @__PURE__ */ jsx(View, { style: { borderBottomWidth: BOX, borderColor: INK, paddingHorizontal: 4, paddingVertical: 1 }, children: /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, fontFamily: BOLD }, children: LABELS.diagnostico }) }),
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, paddingHorizontal: 4, paddingTop: 2 }, children: datos2.diagnostico })
      ] }),
      /* @__PURE__ */ jsx(View, { style: { height: H.gSpacer } }),
      /* @__PURE__ */ jsx(View, { style: { borderWidth: BOX, borderColor: INK, height: H.garantiaRow * 9 + H.garantiaLast, paddingVertical: 3, paddingHorizontal: 4 }, children: /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.warranty, textAlign: "justify", lineHeight: 1.12 }, children: GARANTIA_RUNS.map((run, i) => /* @__PURE__ */ jsx(Text, { style: { fontFamily: run.bold ? BOLD : REG }, children: run.t }, i)) }) }),
      /* @__PURE__ */ jsx(View, { style: { height: H.bottom } })
    ] })
  ] }) }) });
}
function Header({ datos: datos2 }) {
  return /* @__PURE__ */ jsxs(View, { style: { height: H.header, flexDirection: "row", alignItems: "center" }, children: [
    /* @__PURE__ */ jsxs(View, { style: { width: CONTENT_W - RIGHT_CLUSTER_W, flexDirection: "row", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx(Image, { src: LOGO_CELTUC, style: { width: LOGO, height: LOGO } }),
      /* @__PURE__ */ jsxs(View, { children: [
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.celtuc, fontFamily: BOLD, letterSpacing: 0.8 }, children: EMPRESA.nombre }),
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.address, marginTop: 3 }, children: EMPRESA.direccion }),
        /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }, children: [
          /* @__PURE__ */ jsx(Image, { src: ICON_INSTAGRAM, style: { width: SOCIAL_ICON, height: SOCIAL_ICON } }),
          /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.social }, children: EMPRESA.instagram }),
          /* @__PURE__ */ jsx(Image, { src: ICON_FACEBOOK, style: { width: SOCIAL_ICON, height: SOCIAL_ICON, marginLeft: 4 } }),
          /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.social }, children: EMPRESA.facebook })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: { width: RIGHT_CLUSTER_W, justifyContent: "center", gap: 10 }, children: [
      /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx(Text, { style: { width: LABEL_F_W, fontSize: FONT.body }, children: LABELS.cupon }),
        /* @__PURE__ */ jsx(View, { style: { flex: 1, height: 20, borderWidth: BOX, borderColor: INK, justifyContent: "center" }, children: /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, textAlign: "center" }, children: datos2.cupon }) })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx(Text, { style: { width: LABEL_F_W, fontSize: FONT.body }, children: LABELS.fecha }),
        /* @__PURE__ */ jsxs(View, { style: { flexDirection: "row", height: 20, borderWidth: BOX, borderColor: INK }, children: [
          /* @__PURE__ */ jsx(DateCell, { width: DATE_BOX[0], value: datos2.fechaDia }),
          /* @__PURE__ */ jsx(DateCell, { width: DATE_BOX[1], value: datos2.fechaMes, divider: true }),
          /* @__PURE__ */ jsx(DateCell, { width: DATE_BOX[2], value: datos2.fechaAnio, divider: true })
        ] })
      ] })
    ] })
  ] });
}
function DateCell({ width, value, divider }) {
  return /* @__PURE__ */ jsx(View, { style: { width, justifyContent: "center", borderLeftWidth: divider ? BOX : 0, borderColor: INK }, children: /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, textAlign: "center" }, children: value }) });
}
function Line({ label, value }) {
  return /* @__PURE__ */ jsxs(View, { style: { height: H.line, flexDirection: "row", alignItems: "flex-end" }, children: [
    label ? /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, fontFamily: BOLD, paddingBottom: 2, paddingRight: 6 }, children: label }) : null,
    /* @__PURE__ */ jsx(View, { style: { flex: 1, borderBottomWidth: 1, borderColor: INK }, children: /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, paddingBottom: 1 }, children: value }) })
  ] });
}
function InfoRow({ label, value, divider }) {
  return /* @__PURE__ */ jsxs(
    View,
    {
      style: {
        height: H.infoRow,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: divider ? BOX : 0,
        borderColor: INK,
        paddingHorizontal: 3,
        gap: 4
      },
      children: [
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, fontFamily: BOLD }, children: label }),
        /* @__PURE__ */ jsx(Text, { style: { fontSize: FONT.body, flex: 1 }, children: value })
      ]
    }
  );
}

// src/documentos/recepcionXlsx.ts
import ExcelJS from "exceljs";
var BLACK = { argb: "FF000000" };
var MEDIUM = { style: "medium", color: BLACK };
var LINEAS = {
  recibiDe: "RECIBI DE ______________________________________________________________________",
  equipos: "EL EQUIPO/S _____________________________________________________________________",
  falla: "CON LA SIGUIENTE FALLA/S_________________________________________________________",
  fallaExtra: "________________________________________________________________________________"
};
async function construirRecepcionXlsx(datos2) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CelTuc";
  wb.created = /* @__PURE__ */ new Date();
  const ws = wb.addWorksheet("Recepcion", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      // A4
      orientation: "portrait",
      horizontalCentered: true,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    }
  });
  const widths = [0.855, 10.71, 7.71, 11.426, 6.855, 12.285, 3.71, 4.285, 3.855, 2.285];
  widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
  const setH = (r, h) => ws.getRow(r).height = h;
  setH(1, 20.1);
  [2, 4, 6].forEach((r) => setH(r, 9.95));
  [3, 5].forEach((r) => setH(r, 15));
  for (let r = 7; r <= 20; r++) setH(r, 14.1);
  setH(21, 12);
  for (let r = 22; r <= 30; r++) setH(r, 15);
  setH(31, 21);
  setH(32, 7.15);
  ["A1:J1", "B7:I7", "B8:I8", "B9:I9", "B10:I10", "B22:I31"].forEach((m) => ws.mergeCells(m));
  const borders = /* @__PURE__ */ new Map();
  const add = (col, row, sides) => {
    const key = `${row}:${col}`;
    borders.set(key, { ...borders.get(key), ...sides });
  };
  const hLine = (cFrom, cTo, row, side) => {
    for (let c = cFrom; c <= cTo; c++) add(c, row, { [side]: MEDIUM });
  };
  const vLine = (col, rFrom, rTo, side) => {
    for (let r = rFrom; r <= rTo; r++) add(col, r, { [side]: MEDIUM });
  };
  hLine(1, 10, 32, "bottom");
  vLine(1, 2, 32, "left");
  vLine(10, 2, 32, "right");
  hLine(7, 9, 3, "top");
  hLine(7, 9, 3, "bottom");
  add(7, 3, { left: MEDIUM });
  add(9, 3, { right: MEDIUM });
  hLine(7, 9, 5, "top");
  hLine(7, 9, 5, "bottom");
  [7, 8, 9].forEach((c) => add(c, 5, { left: MEDIUM }));
  add(9, 5, { right: MEDIUM });
  hLine(2, 9, 12, "top");
  hLine(2, 9, 13, "bottom");
  vLine(2, 12, 13, "left");
  vLine(9, 12, 13, "right");
  hLine(2, 4, 15, "top");
  [15, 16, 17].forEach((r) => hLine(2, 4, r, "bottom"));
  vLine(2, 15, 17, "left");
  vLine(4, 15, 17, "right");
  hLine(6, 9, 15, "top");
  [15, 16, 17].forEach((r) => hLine(6, 9, r, "bottom"));
  vLine(6, 15, 17, "left");
  vLine(9, 15, 17, "right");
  hLine(2, 9, 19, "top");
  hLine(2, 9, 19, "bottom");
  hLine(2, 9, 20, "bottom");
  vLine(2, 19, 20, "left");
  vLine(9, 19, 20, "right");
  borders.forEach((side, key) => {
    const [row, col] = key.split(":").map(Number);
    ws.getCell(row, col).border = side;
  });
  const cajaCompleta = { top: MEDIUM, bottom: MEDIUM, left: MEDIUM, right: MEDIUM };
  ws.getCell("A1").border = cajaCompleta;
  ws.getCell("B22").border = cajaCompleta;
  const calibri = (size, bold = false) => ({ name: "Calibri", size, bold });
  const put = (addr, value, font, align) => {
    const cell = ws.getCell(addr);
    cell.value = value;
    cell.font = font;
    if (align) cell.alignment = align;
  };
  const conValor = (label, value, blanco) => value.trim() ? `${label} ${value}` : blanco;
  put("A1", "RECEPCION DE EQUIPO/S", calibri(14, true), { horizontal: "center", vertical: "middle" });
  put("C3", "   " + EMPRESA.nombre, calibri(16, true), { horizontal: "left", vertical: "middle" });
  put("C4", EMPRESA.direccion, calibri(8), { horizontal: "left", vertical: "middle" });
  put("C5", `   ${EMPRESA.instagram}      ${EMPRESA.facebook}`, calibri(9), { horizontal: "left", vertical: "middle" });
  put("F3", LABELS.cupon, calibri(11), { horizontal: "center", vertical: "middle" });
  put("F5", LABELS.fecha, calibri(11), { horizontal: "center", vertical: "middle" });
  const center = { horizontal: "center", vertical: "middle" };
  put("G3", datos2.cupon, calibri(11), center);
  put("G5", datos2.fechaDia, calibri(11), center);
  put("H5", datos2.fechaMes, calibri(11), center);
  put("I5", datos2.fechaAnio, calibri(11), center);
  const left = { horizontal: "left", vertical: "middle" };
  put("B7", conValor(LABELS.recibiDe, datos2.recibiDe, LINEAS.recibiDe), calibri(11, true), left);
  put("B8", conValor(LABELS.equipos, datos2.equipos, LINEAS.equipos), calibri(11, true), left);
  put("B9", conValor(LABELS.falla, datos2.falla, LINEAS.falla), calibri(11, true), left);
  put("B10", datos2.fallaExtra.trim() || LINEAS.fallaExtra, calibri(11, true), left);
  put("B12", LABELS.obs, calibri(11, true), left);
  put("C12", datos2.obs, calibri(11), { horizontal: "left", vertical: "top", wrapText: true });
  put("B15", conValor(LABELS.recepciono, datos2.recepciono, LABELS.recepciono), calibri(11, true), left);
  put("B16", conValor(LABELS.codDesbloqueo, datos2.codDesbloqueo, LABELS.codDesbloqueo), calibri(11, true), left);
  put("B17", conValor(LABELS.tel, datos2.tel, LABELS.tel), calibri(11, true), left);
  put("F15", conValor(LABELS.presupuesto, datos2.presupuesto, LABELS.presupuesto), calibri(11, true), left);
  put("F16", conValor(LABELS.sena, datos2.sena, LABELS.sena), calibri(11, true), left);
  put("F17", conValor(LABELS.pendiente, datos2.pendiente, LABELS.pendiente), calibri(11, true), left);
  put("B19", LABELS.diagnostico, calibri(11, true), left);
  put("B20", datos2.diagnostico, calibri(11), { horizontal: "left", vertical: "middle", wrapText: true });
  ws.getCell("B22").value = {
    richText: GARANTIA_RUNS.map((r) => ({ font: { name: "Calibri", size: 7, bold: !!r.bold }, text: r.t }))
  };
  ws.getCell("B22").alignment = { horizontal: "justify", vertical: "top", wrapText: true };
  const addImg = (dataUri, ext) => wb.addImage({ base64: dataUri.split(",")[1], extension: ext });
  const logoId = addImg(LOGO_CELTUC, "jpeg");
  ws.addImage(logoId, { tl: { col: 1.03, row: 1.35 }, ext: { width: 66, height: 66 }, editAs: "oneCell" });
  const igId = addImg(ICON_INSTAGRAM, "jpeg");
  ws.addImage(igId, { tl: { col: 1.92, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: "oneCell" });
  const fbId = addImg(ICON_FACEBOOK, "jpeg");
  ws.addImage(fbId, { tl: { col: 3, row: 4.35 }, ext: { width: 13, height: 13 }, editAs: "oneCell" });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// src/__genTest.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
var OUT = "C:/Users/Isaias/AppData/Local/Temp/claude/C--Users-Isaias-Desktop-Proyectos-CelTuc/61984214-9d1b-40db-9012-ad4870d1a71b/scratchpad";
var datos = {
  cupon: "0123",
  fechaDia: "25",
  fechaMes: "06",
  fechaAnio: "26",
  recibiDe: "Juan P\xE9rez",
  equipos: "iPhone 11 negro 128GB",
  falla: "No enciende, posible falla de placa.",
  fallaExtra: "Trae cargador y caja.",
  obs: "Golpe en esquina inferior derecha.",
  recepciono: "Mauro",
  codDesbloqueo: "1234",
  tel: "381-5551234",
  presupuesto: "45000",
  sena: "20000",
  pendiente: "25000",
  diagnostico: "Se reemplaza pin de carga y se testea bater\xEDa."
};
await ReactPDF.renderToFile(/* @__PURE__ */ jsx2(RecepcionPdf, { datos }), `${OUT}/recepcion_test.pdf`);
console.log("PDF OK");
var blob = await construirRecepcionXlsx(datos);
var buf = Buffer.from(await blob.arrayBuffer());
writeFileSync(`${OUT}/recepcion_test.xlsx`, buf);
console.log("XLSX OK", buf.length, "bytes");
