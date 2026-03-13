import { extendUtils } from './modules/utils.js';
import { extendProvas } from './modules/provas.js';
import { extendAlunos } from './modules/alunos.js';
import { extendMateriais } from './modules/materiais.js';
import { extendComunicacao } from './modules/comunicacao.js';
import { extendChat } from './modules/chat.js';
import { extendDiario } from './modules/diario.js';
import { extendCalendario } from './modules/calendario.js';
import { extendDashboard } from './modules/dashboard.js';
import { extendRelatorios } from './modules/relatorios.js';
import { extendUsuarios } from './modules/usuarios.js';
import { extendPresenca } from './modules/presenca.js';

// Coordinator: delegates all feature extensions to domain modules.
export function extendApp(app) {
    extendUtils(app);
    extendProvas(app);
    extendAlunos(app);
    extendMateriais(app);
    extendComunicacao(app);
    extendChat(app);
    extendDiario(app);
    extendCalendario(app);
    extendDashboard(app);
    extendRelatorios(app);
    extendUsuarios(app);
    extendPresenca(app);
}