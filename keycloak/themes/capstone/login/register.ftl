<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm') displayInfo=false; section>
    <#if section = "header">
        <div class="capstone-header">
            <div class="capstone-badge">BE Capstone</div>
            <div class="capstone-title">Create your account</div>
            <p>Register once, then sign in securely every time.</p>
        </div>
    <#elseif section = "form">
        <div class="capstone-shell">
            <div class="capstone-panel capstone-panel--brand">
                <div>
                    <div class="capstone-badge">Get started</div>
                    <h2>Join the Capstone platform</h2>
                    <p>
                        Create your account to get started.
                        Google sign-in, password recovery, and MFA are all handled by Keycloak.
                    </p>
                </div>
                <ul class="capstone-highlights">
                    <li>Secure OIDC identity management</li>
                    <li>Optional social login through Google</li>
                    <li>Local profile provisioned on first sign-in</li>
                </ul>
            </div>

            <div class="capstone-panel capstone-panel--form">
                <form id="kc-register-form" class="capstone-form" action="${url.registrationAction}" method="post">
                    <div class="capstone-field">
                        <label for="firstName">${msg("firstName")}</label>
                        <input
                            type="text"
                            id="firstName"
                            class="capstone-input"
                            name="firstName"
                            value="${(register.formData.firstName!'')}"
                            autocomplete="given-name"
                            autofocus
                        />
                        <#if messagesPerField.existsError('firstName')>
                            <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('firstName'))?no_esc}</span>
                        </#if>
                    </div>

                    <div class="capstone-field">
                        <label for="lastName">${msg("lastName")}</label>
                        <input
                            type="text"
                            id="lastName"
                            class="capstone-input"
                            name="lastName"
                            value="${(register.formData.lastName!'')}"
                            autocomplete="family-name"
                        />
                        <#if messagesPerField.existsError('lastName')>
                            <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('lastName'))?no_esc}</span>
                        </#if>
                    </div>

                    <div class="capstone-field">
                        <label for="email">${msg("email")}</label>
                        <input
                            type="email"
                            id="email"
                            class="capstone-input"
                            name="email"
                            value="${(register.formData.email!'')}"
                            autocomplete="email"
                        />
                        <#if messagesPerField.existsError('email')>
                            <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('email'))?no_esc}</span>
                        </#if>
                    </div>

                    <#if !realm.registrationEmailAsUsername>
                        <div class="capstone-field">
                            <label for="username">${msg("username")}</label>
                            <input
                                type="text"
                                id="username"
                                class="capstone-input"
                                name="username"
                                value="${(register.formData.username!'')}"
                                autocomplete="username"
                            />
                            <#if messagesPerField.existsError('username')>
                                <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}</span>
                            </#if>
                        </div>
                    </#if>

                    <#if passwordRequired?? && passwordRequired>
                        <div class="capstone-field">
                            <label for="password">${msg("password")}</label>
                            <input
                                type="password"
                                id="password"
                                class="capstone-input"
                                name="password"
                                autocomplete="new-password"
                            />
                            <#if messagesPerField.existsError('password')>
                                <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('password'))?no_esc}</span>
                            </#if>
                        </div>

                        <div class="capstone-field">
                            <label for="password-confirm">${msg("passwordConfirm")}</label>
                            <input
                                type="password"
                                id="password-confirm"
                                class="capstone-input"
                                name="password-confirm"
                                autocomplete="new-password"
                            />
                            <#if messagesPerField.existsError('password-confirm')>
                                <span class="capstone-error">${kcSanitize(messagesPerField.getFirstError('password-confirm'))?no_esc}</span>
                            </#if>
                        </div>
                    </#if>

                    <button class="capstone-button" type="submit">
                        ${msg("doRegister")}
                    </button>

                    <div class="capstone-footnote">
                        <span>Already have an account?</span>
                        <a class="capstone-link" href="${url.loginUrl}">${msg("backToLogin")}</a>
                    </div>
                </form>

                <#if social.providers?? && social.providers?has_content>
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
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
