<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username') displayInfo=false; section>
    <#if section = "header">
        <div class="capstone-header">
            <div class="capstone-badge">BE Capstone</div>
            <div class="capstone-title">Reset your password</div>
            <p>Enter your email or username and we'll help you recover access.</p>
        </div>
    <#elseif section = "form">
        <div class="capstone-shell">
            <div class="capstone-panel capstone-panel--brand">
                <div>
                    <div class="capstone-badge">Account recovery</div>
                    <h2>Get back into your&nbsp;account</h2>
                    <p>
                        Keycloak will verify your identity and send the next recovery step.
                        Your account stays protected while the flow remains simple.
                    </p>
                </div>
                <ul class="capstone-highlights">
                    <li>Secure password recovery via Keycloak</li>
                    <li>Works with local and federated identities</li>
                    <li>Consistent Capstone theme experience</li>
                </ul>
            </div>

            <div class="capstone-panel capstone-panel--form">
                <form id="kc-reset-password-form" class="capstone-form" action="${url.loginAction}" method="post">
                    <div class="capstone-field">
                        <label for="username">
                            <#if !realm.loginWithEmailAllowed>${msg("username")}
                            <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
                            <#else>${msg("email")}</#if>
                        </label>
                        <input
                            type="text"
                            id="username"
                            class="capstone-input"
                            name="username"
                            value="${(auth.attemptedUsername!'')}"
                            autocomplete="username"
                            autofocus
                        />
                        <#if messagesPerField.existsError('username')>
                            <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}</span>
                        </#if>
                    </div>

                    <button class="capstone-button" type="submit">
                        ${msg("doSubmit")}
                    </button>

                    <div class="capstone-footnote">
                        <a class="capstone-link" href="${url.loginUrl}">&larr; ${msg("backToLogin")}</a>
                    </div>
                </form>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
