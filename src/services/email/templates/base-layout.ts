/**
 * Layout base HTML/texto para todos los correos de AuraHealth.
 * Provee diseño responsivo, branding consistente y pie de página institucional.
 */

interface BaseLayoutProps {
  title: string;
  preheader?: string;
  contentHtml: string;
}

export function renderBaseLayout({ title, preheader = "", contentHtml }: BaseLayoutProps): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 32px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      padding: 24px 32px;
      text-align: left;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.025em;
    }
    .header p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #ccfbf1;
    }
    .body-content {
      padding: 32px;
      line-height: 1.6;
      font-size: 15px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-teal { background-color: #ccfbf1; color: #0f766e; }
    .badge-rose { background-color: #ffe4e6; color: #be123c; }
    .badge-amber { background-color: #fef3c7; color: #b45309; }
    .badge-blue { background-color: #dbeafe; color: #1d4ed8; }
    .card-detail {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .card-detail table {
      width: 100%;
      border-collapse: collapse;
    }
    .card-detail td {
      padding: 6px 0;
      font-size: 14px;
      vertical-align: top;
    }
    .card-detail td.label {
      color: #64748b;
      font-weight: 500;
      width: 35%;
    }
    .card-detail td.value {
      color: #0f172a;
      font-weight: 600;
    }
    .btn {
      display: inline-block;
      background-color: #0d9488;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      margin-top: 16px;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 20px 32px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  ${preheader ? `<span style="display:none;font-size:1px;color:#f1f5f9;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ""}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>AuraHealth</h1>
        <p>Centro Médico & Vacunatorio</p>
      </div>
      <div class="body-content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p><strong>AuraHealth</strong> · Sistema Integral de Gestión Médica</p>
        <p>Este es un mensaje automático de notificación institucional. Por favor no responda a este correo.</p>
        <p>Para gestionar o cancelar sus turnos, acceda a su portal de paciente.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
