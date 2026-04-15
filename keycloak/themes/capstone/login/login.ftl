<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=false; section>
    <#if section = "header">
        <div class="capstone-header">
            <div class="capstone-badge">BE Capstone</div>
            <div class="capstone-title">Welcome back</div>
            <p>Sign in to continue to the platform.</p>
        </div>
    <#elseif section = "form">
        <div class="capstone-shell">
            <div class="capstone-panel capstone-panel--brand">
                <div>
                    <div class="capstone-badge">Secure by default</div>
                    <h2>Authentication for&nbsp;Capstone</h2>
                    <p>
                        Sign in with your Keycloak account or continue with Google.
                        Sessions, MFA, and social login are all managed by Keycloak.
                    </p>
                </div>
                <ul class="capstone-highlights">
                    <li>OAuth 2.0 authorization code flow</li>
                    <li>Google login via Keycloak broker</li>
                    <li>Local user provisioned on first sign-in</li>
                </ul>
            </div>

            <div class="capstone-panel capstone-panel--form">
                <#if realm.password>
                    <form id="kc-form-login" class="capstone-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                        <div class="capstone-field">
                            <label for="username">
                                <#if !realm.loginWithEmailAllowed>${msg("username")}
                                <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
                                <#else>${msg("email")}</#if>
                            </label>
                            <input
                                tabindex="1"
                                id="username"
                                class="capstone-input"
                                name="username"
                                value="${(login.username!'')}"
                                type="text"
                                autocomplete="username"
                                autofocus
                            />
                            <#if messagesPerField.existsError('username','password')>
                                <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</span>
                            </#if>
                        </div>

                        <div class="capstone-field">
                            <div class="capstone-field-row">
                                <label for="password">${msg("password")}</label>
                                <#if realm.resetPasswordAllowed>
                                    <a class="capstone-link" tabindex="5" href="${url.loginResetCredentialsUrl}">
                                        ${msg("doForgotPassword")}
                                    </a>
                                </#if>
                            </div>
                            <input
                                tabindex="2"
                                id="password"
                                class="capstone-input"
                                name="password"
                                type="password"
                                autocomplete="current-password"
                            />
                        </div>

                        <#if realm.rememberMe && !usernameEditDisabled??>
                            <label class="capstone-checkbox">
                                <#if login.rememberMe??>
                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked />
                                <#else>
                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" />
                                </#if>
                                <span>${msg("rememberMe")}</span>
                            </label>
                        </#if>

                        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

                        <button tabindex="4" class="capstone-button" name="login" id="kc-login" type="submit">
                            ${msg("doLogIn")}
                        </button>
                    </form>
                </#if>

                <#if realm.password && social.providers?? && social.providers?has_content>
                    <div class="capstone-social">
                        <div class="capstone-social-divider"><span>or continue with</span></div>
                        <div class="capstone-social-list">
                            <#list social.providers as p>
                                <a id="social-${p.alias}" class="capstone-social-button" href="${p.loginUrl}">
                                    <#if p.iconClasses?has_content>
                                        <i class="${p.iconClasses}" aria-hidden="true"></i>
                                    </#if>
                                    <span>${p.displayName!p.alias}</span>
                                </a>
                            </#list>
                        </div>
                    </div>
                </#if>

                <#if realm.registrationAllowed>
                    <div class="capstone-footnote">
                        <span>${msg("noAccount")}</span>
                        <a class="capstone-link" href="${url.registrationUrl}">${msg("doRegister")}</a>
                    </div>
                </#if>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
