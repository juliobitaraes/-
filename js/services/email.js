import { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from '../config/firebase.js';
import { auth, functions } from './init.js';
import { store } from '../store.js';

// ✅ NOVA: Envia email via Firebase Function HTTP + SendGrid REST API
export async function sendEmailViaFunction(to, subject, htmlBody, options = {}) {
    try {
        // Obter token de autenticação
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Usuário não autenticado');
        }
        
        const idToken = await user.getIdToken();
        const schoolId = options.schoolId || store.activeSchoolId;
        if (!schoolId) {
            throw new Error('Escola ativa não encontrada para envio de email.');
        }

        // Chamar HTTP Function com Bearer token
        const response = await fetch('https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
                'x-school-id': schoolId
            },
            body: JSON.stringify({
                schoolId,
                to: to, // Pode ser string ou array
                subject: subject,
                html: htmlBody,
                text: options.text || '',
                replyTo: options.replyTo || 'senateduvaledoaco@gmail.com'
            })
        });

        if (!response.ok) {
            let errorData = null;
            try {
                errorData = await response.json();
            } catch (_e) {
                errorData = null;
            }
            throw new Error(errorData?.message || errorData?.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('📧 Email enviado com sucesso:', result);
        return { success: true, data: result };
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        throw error;
    }
}

// ⚠️ LEGADO: EmailJS (deprecated - usar sendEmailViaFunction())
export function sendWelcomeEmail(email, nome, turmasNome) {
    const templateParams = { nome, email, turmas: turmasNome.join(', ') };
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
        .then(() => alert(`Sucesso! E-mail enviado para ${email}.`))
        .catch(err => alert(`ERRO ao enviar e-mail: ${JSON.stringify(err)}`));
}

export function sendPasswordReset(email) {
    if (!confirm(`Enviar e-mail de redefinição de senha para ${email}?`)) return;
    auth.sendPasswordResetEmail(email)
        .then(() => alert(`E-mail de redefinição enviado com sucesso para ${email}!`))
        .catch(err => {
            console.error(err);
            alert("Erro ao enviar e-mail: " + err.message);
        });
}

// ⚠️ LEGADO: Usa EmailJS (deprecated - usar sendNotificationEmailV2())
export function sendNotificationEmail(email, nome, assunto, mensagem, meta = {}) {
    const templateParams = {
        nome: nome || 'Aluno',
        email,
        assunto: assunto || 'Aviso do sistema',
        mensagem: mensagem || '',
        turma: meta.turma || '',
        link: meta.link || ''
    };
    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
        .catch(err => {
            console.warn('Falha ao enviar email:', err);
            throw err;
        });
}

// ✅ NOVA: Versão atualizada usando Firebase Function
export async function sendNotificationEmailV2(email, nome, assunto, mensagem, meta = {}) {
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
                .button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; 
                          border-radius: 5px; display: inline-block; margin: 15px 0; }
                .footer { background: #f1f1f1; padding: 15px; border-radius: 0 0 5px 5px; 
                          font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>${assunto}</h2>
                </div>
                <div class="content">
                    <p>Olá <strong>${nome || 'Aluno'}</strong>,</p>
                    <p>${mensagem.replace(/\n/g, '<br>')}</p>
                    ${meta.turma ? `<p><strong>Turma:</strong> ${meta.turma}</p>` : ''}
                    ${meta.link ? `<p><a href="${meta.link}" class="button">Acessar Sistema</a></p>` : ''}
                </div>
                <div class="footer">
                    <p>Esta é uma notificação automática do sistema SENATEDU.</p>
                    <p>Por favor, não responda este email.</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return sendEmailViaFunction(email, assunto, htmlBody, {
        replyTo: meta.replyTo || 'senateduvaledoaco@gmail.com'
    });
}
