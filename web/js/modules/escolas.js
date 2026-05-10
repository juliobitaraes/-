import {
    buildFeatureCheckboxes,
    buildSchoolOptions,
    buildSchoolFeatureOptions,
    buildSchoolRows,
    buildEscolasPageHtml
} from './schoolViewBuilders.js';

export function extendEscolas(app) {
app.renderEscolas = async function(content) {
    const result = await firebase.functions().httpsCallable('getSchoolsOverview')({});
    const schools = (result && result.data && Array.isArray(result.data.schools)) ? result.data.schools : [];
    const configurableSections = app.getConfigurableSidebarSections();
    const view = {
        featureCheckboxes: buildFeatureCheckboxes(app, configurableSections),
        schoolOptions: buildSchoolOptions(app, schools),
        schoolFeatureOptions: buildSchoolFeatureOptions(app, schools),
        rows: buildSchoolRows(app, schools)
    };
    const defaultFeatureSchoolId = schools.length > 0 ? schools[0].id : '';

    content.innerHTML = buildEscolasPageHtml(app, view);

    if (defaultFeatureSchoolId) {
        const featureSelect = document.getElementById('escola-feature-id');
        if (featureSelect) featureSelect.value = defaultFeatureSchoolId;
        app.prefillSchoolFeatureToggles(defaultFeatureSchoolId);
    }
};

}
