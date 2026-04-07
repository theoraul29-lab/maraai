/**
 * Generate 25 language JSON files for MaraAI i18n.
 * Trading strategy names/steps stay in English (universal finance terms).
 * Core UI strings are translated per language.
 * Run: node generate-langs.cjs
 */
const fs = require('fs');
const path = require('path');

const en = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales/en.json'), 'utf8'));

// Core translations per language. Trading strategies use English fallback.
const translations = {
  es: {
    common: { close: "Cerrar", save: "Guardar", cancel: "Cancelar", delete: "Eliminar", edit: "Editar", loading: "Cargando...", error: "Error", success: "Éxito", submit: "Enviar", back: "Atrás", next: "Siguiente", search: "Buscar", noResults: "No se encontraron resultados", retry: "Reintentar", confirm: "Confirmar", yes: "Sí", no: "No", or: "O", all: "Todos" },
    nav: { home: "Inicio", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Creador", writers: "Escritores", profile: "Perfil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menú" },
    home: { title: "Inicio MaraAI - Navegación Orbital", orbitalNav: "Inicio MaraAI - Navegación Orbital", mara: "MARA", maraCenter: "MARA - Asistente IA Central", navigateTo: "Navegar a {{module}}", navigateToModule: "Navegar al módulo", moduleLabel: "Módulo {{module}}", you: "Tú", reels: "Reels", trading: "Trading", vip: "VIP", creators: "Creadores", writers: "Escritores" },
    auth: { welcomeBack: "Bienvenido de vuelta", joinMaraAI: "Únete a MaraAI", trialInfo: "Comienza tu prueba de 1 hora al instante", email: "Email", password: "Contraseña", yourName: "Tu Nombre", emailRequired: "El email es obligatorio", emailInvalid: "Introduce un email válido", passwordRequired: "La contraseña es obligatoria", passwordMinLength: "La contraseña debe tener al menos 8 caracteres", nameRequired: "El nombre es obligatorio", nameMinLength: "El nombre debe tener al menos 2 caracteres", passwordHint: "✓ La contraseña debe tener al menos 8 caracteres", login: "Iniciar sesión", createAccount: "Crear cuenta", signingIn: "Iniciando sesión...", creatingAccount: "Creando cuenta...", google: "Google", facebook: "Facebook", noAccount: "¿No tienes cuenta?", signUp: "Regístrate", hasAccount: "¿Ya tienes cuenta?", logIn: "Inicia sesión", closeModal: "Cerrar modal de autenticación", closeEsc: "Cerrar (Esc)", socialLogin: "Opciones de inicio social", signInWith: "Iniciar sesión con {{provider}}", switchToSignup: "Ir a registro", switchToLogin: "Ir a inicio de sesión", or: "O" },
    chat: { title: "Chat con Mara", placeholder: "Escribe tu mensaje...", send: "Enviar", welcome: "👋 ¡Hola {{name}}! Soy Mara, tu asistente inteligente. ¿En qué puedo ayudarte?", welcomeGuest: "👋 ¡Hola! Soy Mara. ¿En qué puedo ayudarte?", quickModules: "¿Qué módulos tiene la plataforma?", quickRecommend: "Recomendación para mí", quickHow: "¿Cómo funciona?", errorMsg: "Lo siento, hubo un error. Inténtalo de nuevo.", issueMsg: "Hubo un problema. Inténtalo de nuevo.", thinking: "Pensando...", modules: "📚 Módulos", recommendations: "🎯 Recomendaciones", help: "❓ Ayuda", selectLanguage: "Seleccionar idioma", typing: "Mara está escribiendo...", chatError: "Error de conexión. Inténtalo de nuevo." },
    languageSelector: { label: "Idioma", changeLanguage: "Cambiar idioma" }
  },
  fr: {
    common: { close: "Fermer", save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier", loading: "Chargement...", error: "Erreur", success: "Succès", submit: "Soumettre", back: "Retour", next: "Suivant", search: "Rechercher", noResults: "Aucun résultat", retry: "Réessayer", confirm: "Confirmer", yes: "Oui", no: "Non", or: "OU", all: "Tous" },
    nav: { home: "Accueil", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Créateur", writers: "Écrivains", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    home: { title: "Accueil MaraAI - Navigation Orbitale", orbitalNav: "Accueil MaraAI - Navigation Orbitale", mara: "MARA", maraCenter: "MARA - Assistant IA Central", navigateTo: "Naviguer vers {{module}}", navigateToModule: "Naviguer vers le module", moduleLabel: "Module {{module}}", you: "Vous", reels: "Reels", trading: "Trading", vip: "VIP", creators: "Créateurs", writers: "Écrivains" },
    auth: { welcomeBack: "Bienvenue", joinMaraAI: "Rejoignez MaraAI", trialInfo: "Commencez votre essai d'1 heure instantanément", email: "Email", password: "Mot de passe", yourName: "Votre Nom", emailRequired: "L'email est requis", emailInvalid: "Veuillez entrer un email valide", passwordRequired: "Le mot de passe est requis", passwordMinLength: "Le mot de passe doit contenir au moins 8 caractères", nameRequired: "Le nom est requis", nameMinLength: "Le nom doit contenir au moins 2 caractères", passwordHint: "✓ Le mot de passe doit faire au moins 8 caractères", login: "Se connecter", createAccount: "Créer un compte", signingIn: "Connexion...", creatingAccount: "Création du compte...", google: "Google", facebook: "Facebook", noAccount: "Pas de compte ?", signUp: "S'inscrire", hasAccount: "Déjà un compte ?", logIn: "Se connecter", closeModal: "Fermer la fenêtre d'authentification", closeEsc: "Fermer (Esc)", socialLogin: "Options de connexion sociale", signInWith: "Se connecter avec {{provider}}", switchToSignup: "Passer à l'inscription", switchToLogin: "Passer à la connexion", or: "OU" },
    chat: { title: "Chat avec Mara", placeholder: "Écrivez votre message...", send: "Envoyer", welcome: "👋 Bonjour {{name}} ! Je suis Mara, votre assistant intelligent. Comment puis-je vous aider ?", welcomeGuest: "👋 Bonjour ! Je suis Mara. Comment puis-je vous aider ?", quickModules: "Quels modules possède la plateforme ?", quickRecommend: "Recommandation pour moi", quickHow: "Comment ça marche ?", errorMsg: "Désolé, une erreur est survenue. Réessayez.", issueMsg: "Un problème est survenu. Réessayez.", thinking: "Réflexion...", modules: "📚 Modules", recommendations: "🎯 Recommandations", help: "❓ Aide", selectLanguage: "Choisir la langue", typing: "Mara écrit...", chatError: "Erreur de connexion. Réessayez." },
    languageSelector: { label: "Langue", changeLanguage: "Changer de langue" }
  },
  de: {
    common: { close: "Schließen", save: "Speichern", cancel: "Abbrechen", delete: "Löschen", edit: "Bearbeiten", loading: "Laden...", error: "Fehler", success: "Erfolg", submit: "Absenden", back: "Zurück", next: "Weiter", search: "Suchen", noResults: "Keine Ergebnisse", retry: "Erneut versuchen", confirm: "Bestätigen", yes: "Ja", no: "Nein", or: "ODER", all: "Alle" },
    nav: { home: "Startseite", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Ersteller", writers: "Autoren", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menü" },
    home: { title: "MaraAI Start - Orbitalnavigation", orbitalNav: "MaraAI Start - Orbitalnavigation", mara: "MARA", maraCenter: "MARA - KI-Assistent im Zentrum", navigateTo: "Zu {{module}} navigieren", navigateToModule: "Zum Modul navigieren", moduleLabel: "Modul {{module}}", you: "Du", reels: "Reels", trading: "Trading", vip: "VIP", creators: "Ersteller", writers: "Autoren" },
    auth: { welcomeBack: "Willkommen zurück", joinMaraAI: "MaraAI beitreten", trialInfo: "Starten Sie Ihre 1-Stunden-Testversion sofort", email: "E-Mail", password: "Passwort", yourName: "Ihr Name", emailRequired: "E-Mail ist erforderlich", emailInvalid: "Bitte geben Sie eine gültige E-Mail ein", passwordRequired: "Passwort ist erforderlich", passwordMinLength: "Passwort muss mindestens 8 Zeichen haben", nameRequired: "Name ist erforderlich", nameMinLength: "Name muss mindestens 2 Zeichen haben", passwordHint: "✓ Passwort muss mindestens 8 Zeichen haben", login: "Anmelden", createAccount: "Konto erstellen", signingIn: "Anmeldung...", creatingAccount: "Konto wird erstellt...", google: "Google", facebook: "Facebook", noAccount: "Kein Konto?", signUp: "Registrieren", hasAccount: "Bereits ein Konto?", logIn: "Anmelden", closeModal: "Authentifizierung schließen", closeEsc: "Schließen (Esc)", socialLogin: "Soziale Anmeldeoptionen", signInWith: "Anmelden mit {{provider}}", switchToSignup: "Zur Registrierung", switchToLogin: "Zur Anmeldung", or: "ODER" },
    chat: { title: "Chat mit Mara", placeholder: "Nachricht schreiben...", send: "Senden", welcome: "👋 Hallo {{name}}! Ich bin Mara, Ihr intelligenter Assistent. Wie kann ich Ihnen helfen?", welcomeGuest: "👋 Hallo! Ich bin Mara. Wie kann ich helfen?", quickModules: "Welche Module hat die Plattform?", quickRecommend: "Empfehlung für mich", quickHow: "Wie funktioniert es?", errorMsg: "Entschuldigung, ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.", issueMsg: "Ein Problem ist aufgetreten. Bitte versuchen Sie es erneut.", thinking: "Denke nach...", modules: "📚 Module", recommendations: "🎯 Empfehlungen", help: "❓ Hilfe", selectLanguage: "Sprache wählen", typing: "Mara tippt...", chatError: "Verbindungsfehler. Bitte erneut versuchen." },
    languageSelector: { label: "Sprache", changeLanguage: "Sprache ändern" }
  },
  it: {
    common: { close: "Chiudi", save: "Salva", cancel: "Annulla", delete: "Elimina", edit: "Modifica", loading: "Caricamento...", error: "Errore", success: "Successo", submit: "Invia", back: "Indietro", next: "Avanti", search: "Cerca", noResults: "Nessun risultato", retry: "Riprova", confirm: "Conferma", yes: "Sì", no: "No", or: "O", all: "Tutti" },
    nav: { home: "Home", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Creatore", writers: "Scrittori", profile: "Profilo", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    home: { title: "MaraAI Home - Navigazione Orbitale", orbitalNav: "MaraAI Home - Navigazione Orbitale", mara: "MARA", maraCenter: "MARA - Assistente IA Centrale", navigateTo: "Vai a {{module}}", navigateToModule: "Vai al modulo", moduleLabel: "Modulo {{module}}", you: "Tu", reels: "Reels", trading: "Trading", vip: "VIP", creators: "Creatori", writers: "Scrittori" },
    auth: { welcomeBack: "Bentornato", joinMaraAI: "Unisciti a MaraAI", trialInfo: "Inizia subito la prova di 1 ora", email: "Email", password: "Password", yourName: "Il tuo Nome", emailRequired: "L'email è obbligatoria", emailInvalid: "Inserisci un'email valida", passwordRequired: "La password è obbligatoria", passwordMinLength: "La password deve avere almeno 8 caratteri", nameRequired: "Il nome è obbligatorio", nameMinLength: "Il nome deve avere almeno 2 caratteri", passwordHint: "✓ La password deve avere almeno 8 caratteri", login: "Accedi", createAccount: "Crea account", signingIn: "Accesso...", creatingAccount: "Creazione account...", google: "Google", facebook: "Facebook", noAccount: "Non hai un account?", signUp: "Registrati", hasAccount: "Hai già un account?", logIn: "Accedi", closeModal: "Chiudi autenticazione", closeEsc: "Chiudi (Esc)", socialLogin: "Opzioni accesso social", signInWith: "Accedi con {{provider}}", switchToSignup: "Vai alla registrazione", switchToLogin: "Vai all'accesso", or: "O" },
    chat: { title: "Chat con Mara", placeholder: "Scrivi il tuo messaggio...", send: "Invia", welcome: "👋 Ciao {{name}}! Sono Mara, il tuo assistente intelligente. Come posso aiutarti?", welcomeGuest: "👋 Ciao! Sono Mara. Come posso aiutarti?", quickModules: "Quali moduli ha la piattaforma?", quickRecommend: "Raccomandazione per me", quickHow: "Come funziona?", errorMsg: "Spiacente, si è verificato un errore. Riprova.", issueMsg: "Si è verificato un problema. Riprova.", thinking: "Sto pensando...", modules: "📚 Moduli", recommendations: "🎯 Raccomandazioni", help: "❓ Aiuto", selectLanguage: "Seleziona lingua", typing: "Mara sta scrivendo...", chatError: "Errore di connessione. Riprova." },
    languageSelector: { label: "Lingua", changeLanguage: "Cambia lingua" }
  },
  pt: {
    common: { close: "Fechar", save: "Salvar", cancel: "Cancelar", delete: "Excluir", edit: "Editar", loading: "Carregando...", error: "Erro", success: "Sucesso", submit: "Enviar", back: "Voltar", next: "Próximo", search: "Buscar", noResults: "Nenhum resultado", retry: "Tentar novamente", confirm: "Confirmar", yes: "Sim", no: "Não", or: "OU", all: "Todos" },
    nav: { home: "Início", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Criador", writers: "Escritores", profile: "Perfil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    home: { title: "MaraAI Início - Navegação Orbital", orbitalNav: "MaraAI Início - Navegação Orbital", mara: "MARA", maraCenter: "MARA - Assistente IA Central", navigateTo: "Navegar para {{module}}", navigateToModule: "Navegar para o módulo", moduleLabel: "Módulo {{module}}", you: "Você", reels: "Reels", trading: "Trading", vip: "VIP", creators: "Criadores", writers: "Escritores" },
    auth: { welcomeBack: "Bem-vindo de volta", joinMaraAI: "Junte-se ao MaraAI", trialInfo: "Comece seu teste de 1 hora instantaneamente", email: "Email", password: "Senha", yourName: "Seu Nome", emailRequired: "Email é obrigatório", emailInvalid: "Insira um email válido", passwordRequired: "Senha é obrigatória", passwordMinLength: "A senha deve ter pelo menos 8 caracteres", nameRequired: "Nome é obrigatório", nameMinLength: "O nome deve ter pelo menos 2 caracteres", passwordHint: "✓ A senha deve ter pelo menos 8 caracteres", login: "Entrar", createAccount: "Criar conta", signingIn: "Entrando...", creatingAccount: "Criando conta...", google: "Google", facebook: "Facebook", noAccount: "Não tem conta?", signUp: "Cadastre-se", hasAccount: "Já tem conta?", logIn: "Entrar", closeModal: "Fechar autenticação", closeEsc: "Fechar (Esc)", socialLogin: "Opções de login social", signInWith: "Entrar com {{provider}}", switchToSignup: "Ir para cadastro", switchToLogin: "Ir para login", or: "OU" },
    chat: { title: "Chat com Mara", placeholder: "Escreva sua mensagem...", send: "Enviar", welcome: "👋 Olá {{name}}! Sou Mara, sua assistente inteligente. Como posso ajudar?", welcomeGuest: "👋 Olá! Sou Mara. Como posso ajudar?", quickModules: "Quais módulos a plataforma tem?", quickRecommend: "Recomendação para mim", quickHow: "Como funciona?", errorMsg: "Desculpe, ocorreu um erro. Tente novamente.", issueMsg: "Ocorreu um problema. Tente novamente.", thinking: "Pensando...", modules: "📚 Módulos", recommendations: "🎯 Recomendações", help: "❓ Ajuda", selectLanguage: "Selecionar idioma", typing: "Mara está digitando...", chatError: "Erro de conexão. Tente novamente." },
    languageSelector: { label: "Idioma", changeLanguage: "Mudar idioma" }
  },
  ru: {
    common: { close: "Закрыть", save: "Сохранить", cancel: "Отмена", delete: "Удалить", edit: "Редактировать", loading: "Загрузка...", error: "Ошибка", success: "Успешно", submit: "Отправить", back: "Назад", next: "Далее", search: "Поиск", noResults: "Ничего не найдено", retry: "Повторить", confirm: "Подтвердить", yes: "Да", no: "Нет", or: "ИЛИ", all: "Все" },
    nav: { home: "Главная", reels: "Reels", trading: "Трейдинг", vip: "VIP", creator: "Создатель", writers: "Писатели", profile: "Профиль", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Меню" },
    home: { title: "MaraAI Главная - Орбитальная навигация", orbitalNav: "MaraAI Главная - Орбитальная навигация", mara: "MARA", maraCenter: "MARA - ИИ Ассистент в центре", navigateTo: "Перейти к {{module}}", navigateToModule: "Перейти к модулю", moduleLabel: "Модуль {{module}}", you: "Вы", reels: "Reels", trading: "Трейдинг", vip: "VIP", creators: "Создатели", writers: "Писатели" },
    auth: { welcomeBack: "С возвращением", joinMaraAI: "Присоединитесь к MaraAI", trialInfo: "Начните пробный период на 1 час мгновенно", email: "Email", password: "Пароль", yourName: "Ваше имя", emailRequired: "Email обязателен", emailInvalid: "Введите корректный email", passwordRequired: "Пароль обязателен", passwordMinLength: "Пароль должен быть не менее 8 символов", nameRequired: "Имя обязательно", nameMinLength: "Имя должно быть не менее 2 символов", passwordHint: "✓ Пароль должен быть не менее 8 символов", login: "Войти", createAccount: "Создать аккаунт", signingIn: "Вход...", creatingAccount: "Создание аккаунта...", google: "Google", facebook: "Facebook", noAccount: "Нет аккаунта?", signUp: "Зарегистрироваться", hasAccount: "Уже есть аккаунт?", logIn: "Войти", closeModal: "Закрыть окно аутентификации", closeEsc: "Закрыть (Esc)", socialLogin: "Социальная авторизация", signInWith: "Войти через {{provider}}", switchToSignup: "Перейти к регистрации", switchToLogin: "Перейти к входу", or: "ИЛИ" },
    chat: { title: "Чат с Mara", placeholder: "Напишите сообщение...", send: "Отправить", welcome: "👋 Привет {{name}}! Я Mara, ваш умный ассистент. Чем могу помочь?", welcomeGuest: "👋 Привет! Я Mara. Чем могу помочь?", quickModules: "Какие модули есть на платформе?", quickRecommend: "Рекомендация для меня", quickHow: "Как это работает?", errorMsg: "Извините, произошла ошибка. Попробуйте снова.", issueMsg: "Возникла проблема. Попробуйте снова.", thinking: "Думаю...", modules: "📚 Модули", recommendations: "🎯 Рекомендации", help: "❓ Помощь", selectLanguage: "Выбрать язык", typing: "Mara печатает...", chatError: "Ошибка соединения. Попробуйте снова." },
    languageSelector: { label: "Язык", changeLanguage: "Сменить язык" }
  },
  uk: {
    common: { close: "Закрити", save: "Зберегти", cancel: "Скасувати", delete: "Видалити", edit: "Редагувати", loading: "Завантаження...", error: "Помилка", success: "Успішно", submit: "Надіслати", back: "Назад", next: "Далі", search: "Пошук", noResults: "Нічого не знайдено", retry: "Повторити", confirm: "Підтвердити", yes: "Так", no: "Ні", or: "АБО", all: "Все" },
    nav: { home: "Головна", reels: "Reels", trading: "Трейдинг", vip: "VIP", creator: "Творець", writers: "Письменники", profile: "Профіль", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Меню" },
    home: { title: "MaraAI Головна - Орбітальна навігація", orbitalNav: "MaraAI Головна - Орбітальна навігація", mara: "MARA", maraCenter: "MARA - ШІ Асистент у центрі", navigateTo: "Перейти до {{module}}", navigateToModule: "Перейти до модуля", moduleLabel: "Модуль {{module}}", you: "Ви", reels: "Reels", trading: "Трейдинг", vip: "VIP", creators: "Творці", writers: "Письменники" },
    auth: { welcomeBack: "З поверненням", joinMaraAI: "Приєднуйтесь до MaraAI", trialInfo: "Почніть пробний період на 1 годину миттєво", email: "Email", password: "Пароль", yourName: "Ваше ім'я", emailRequired: "Email обов'язковий", emailInvalid: "Введіть коректний email", passwordRequired: "Пароль обов'язковий", passwordMinLength: "Пароль має бути не менше 8 символів", nameRequired: "Ім'я обов'язкове", nameMinLength: "Ім'я має бути не менше 2 символів", passwordHint: "✓ Пароль має бути не менше 8 символів", login: "Увійти", createAccount: "Створити акаунт", signingIn: "Вхід...", creatingAccount: "Створення акаунту...", google: "Google", facebook: "Facebook", noAccount: "Немає акаунту?", signUp: "Зареєструватися", hasAccount: "Вже є акаунт?", logIn: "Увійти", closeModal: "Закрити вікно автентифікації", closeEsc: "Закрити (Esc)", socialLogin: "Соціальна авторизація", signInWith: "Увійти через {{provider}}", switchToSignup: "Перейти до реєстрації", switchToLogin: "Перейти до входу", or: "АБО" },
    chat: { title: "Чат з Mara", placeholder: "Напишіть повідомлення...", send: "Надіслати", welcome: "👋 Привіт {{name}}! Я Mara, ваш розумний асистент. Чим можу допомогти?", welcomeGuest: "👋 Привіт! Я Mara. Чим можу допомогти?", quickModules: "Які модулі є на платформі?", quickRecommend: "Рекомендація для мене", quickHow: "Як це працює?", errorMsg: "Вибачте, сталася помилка. Спробуйте знову.", issueMsg: "Виникла проблема. Спробуйте знову.", thinking: "Думаю...", modules: "📚 Модулі", recommendations: "🎯 Рекомендації", help: "❓ Допомога", selectLanguage: "Обрати мову", typing: "Mara друкує...", chatError: "Помилка з'єднання. Спробуйте знову." },
    languageSelector: { label: "Мова", changeLanguage: "Змінити мову" }
  },
  pl: {
    common: { close: "Zamknij", save: "Zapisz", cancel: "Anuluj", delete: "Usuń", edit: "Edytuj", loading: "Ładowanie...", error: "Błąd", success: "Sukces", submit: "Wyślij", back: "Wstecz", next: "Dalej", search: "Szukaj", noResults: "Brak wyników", retry: "Ponów", confirm: "Potwierdź", yes: "Tak", no: "Nie", or: "LUB", all: "Wszystkie" },
    nav: { home: "Strona główna", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Twórca", writers: "Pisarze", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    auth: { welcomeBack: "Witaj ponownie", joinMaraAI: "Dołącz do MaraAI", trialInfo: "Rozpocznij 1-godzinny okres próbny", email: "Email", password: "Hasło", yourName: "Twoje imię", emailRequired: "Email jest wymagany", emailInvalid: "Podaj prawidłowy email", passwordRequired: "Hasło jest wymagane", passwordMinLength: "Hasło musi mieć co najmniej 8 znaków", nameRequired: "Imię jest wymagane", nameMinLength: "Imię musi mieć co najmniej 2 znaki", login: "Zaloguj", createAccount: "Utwórz konto", noAccount: "Nie masz konta?", signUp: "Zarejestruj się", hasAccount: "Masz już konto?", logIn: "Zaloguj się", or: "LUB" },
    chat: { title: "Czat z Mara", placeholder: "Napisz wiadomość...", send: "Wyślij", welcome: "👋 Cześć {{name}}! Jestem Mara, Twój inteligentny asystent. Jak mogę pomóc?", welcomeGuest: "👋 Cześć! Jestem Mara. Jak mogę pomóc?", errorMsg: "Przepraszam, wystąpił błąd. Spróbuj ponownie.", modules: "📚 Moduły", recommendations: "🎯 Rekomendacje", help: "❓ Pomoc", typing: "Mara pisze...", chatError: "Błąd połączenia. Spróbuj ponownie." },
    languageSelector: { label: "Język", changeLanguage: "Zmień język" }
  },
  nl: {
    common: { close: "Sluiten", save: "Opslaan", cancel: "Annuleren", delete: "Verwijderen", edit: "Bewerken", loading: "Laden...", error: "Fout", success: "Succes", submit: "Verzenden", back: "Terug", next: "Volgende", search: "Zoeken", noResults: "Geen resultaten", retry: "Opnieuw", confirm: "Bevestigen", yes: "Ja", no: "Nee", or: "OF", all: "Alle" },
    nav: { home: "Home", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Creator", writers: "Schrijvers", profile: "Profiel", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    auth: { welcomeBack: "Welkom terug", joinMaraAI: "Word lid van MaraAI", email: "Email", password: "Wachtwoord", yourName: "Uw naam", login: "Inloggen", createAccount: "Account aanmaken", noAccount: "Geen account?", signUp: "Registreren", hasAccount: "Al een account?", logIn: "Inloggen", or: "OF" },
    chat: { title: "Chat met Mara", placeholder: "Schrijf je bericht...", send: "Verzenden", welcome: "👋 Hoi {{name}}! Ik ben Mara, je slimme assistent. Hoe kan ik helpen?", welcomeGuest: "👋 Hoi! Ik ben Mara. Hoe kan ik helpen?", errorMsg: "Sorry, er is een fout opgetreden. Probeer opnieuw.", modules: "📚 Modules", recommendations: "🎯 Aanbevelingen", help: "❓ Hulp", typing: "Mara typt...", chatError: "Verbindingsfout. Probeer opnieuw." },
    languageSelector: { label: "Taal", changeLanguage: "Taal wijzigen" }
  },
  cs: {
    common: { close: "Zavřít", save: "Uložit", cancel: "Zrušit", delete: "Smazat", edit: "Upravit", loading: "Načítání...", error: "Chyba", success: "Úspěch", submit: "Odeslat", back: "Zpět", next: "Další", search: "Hledat", noResults: "Žádné výsledky", retry: "Zkusit znovu", confirm: "Potvrdit", yes: "Ano", no: "Ne", or: "NEBO", all: "Vše" },
    nav: { home: "Domů", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Tvůrce", writers: "Spisovatelé", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    auth: { welcomeBack: "Vítejte zpět", joinMaraAI: "Připojte se k MaraAI", email: "Email", password: "Heslo", yourName: "Vaše jméno", login: "Přihlásit", createAccount: "Vytvořit účet", noAccount: "Nemáte účet?", signUp: "Registrovat se", hasAccount: "Již máte účet?", logIn: "Přihlásit se", or: "NEBO" },
    chat: { title: "Chat s Mara", placeholder: "Napište zprávu...", send: "Odeslat", welcome: "👋 Ahoj {{name}}! Jsem Mara, váš chytrý asistent. Jak vám mohu pomoci?", welcomeGuest: "👋 Ahoj! Jsem Mara. Jak vám mohu pomoci?", errorMsg: "Omlouváme se, došlo k chybě. Zkuste to znovu.", modules: "📚 Moduly", recommendations: "🎯 Doporučení", help: "❓ Nápověda", typing: "Mara píše...", chatError: "Chyba připojení. Zkuste to znovu." },
    languageSelector: { label: "Jazyk", changeLanguage: "Změnit jazyk" }
  },
  hu: {
    common: { close: "Bezárás", save: "Mentés", cancel: "Mégse", delete: "Törlés", edit: "Szerkesztés", loading: "Betöltés...", error: "Hiba", success: "Sikeres", submit: "Küldés", back: "Vissza", next: "Tovább", search: "Keresés", noResults: "Nincs találat", retry: "Újra", confirm: "Megerősítés", yes: "Igen", no: "Nem", or: "VAGY", all: "Összes" },
    nav: { home: "Kezdőlap", reels: "Reels", trading: "Kereskedés", vip: "VIP", creator: "Alkotó", writers: "Írók", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menü" },
    auth: { welcomeBack: "Üdv újra", joinMaraAI: "Csatlakozz a MaraAI-hoz", email: "Email", password: "Jelszó", yourName: "Neved", login: "Bejelentkezés", createAccount: "Fiók létrehozása", noAccount: "Nincs fiókod?", signUp: "Regisztráció", hasAccount: "Van már fiókod?", logIn: "Bejelentkezés", or: "VAGY" },
    chat: { title: "Chat Mara-val", placeholder: "Írd meg az üzeneted...", send: "Küldés", welcome: "👋 Szia {{name}}! Mara vagyok, az okos asszisztensed. Miben segíthetek?", welcomeGuest: "👋 Szia! Mara vagyok. Miben segíthetek?", errorMsg: "Sajnálom, hiba történt. Próbáld újra.", modules: "📚 Modulok", recommendations: "🎯 Ajánlások", help: "❓ Segítség", typing: "Mara ír...", chatError: "Kapcsolati hiba. Próbáld újra." },
    languageSelector: { label: "Nyelv", changeLanguage: "Nyelv váltása" }
  },
  bg: {
    common: { close: "Затвори", save: "Запази", cancel: "Отказ", delete: "Изтрий", edit: "Редактирай", loading: "Зареждане...", error: "Грешка", success: "Успех", submit: "Изпрати", back: "Назад", next: "Напред", search: "Търси", noResults: "Няма резултати", retry: "Опитай отново", confirm: "Потвърди", yes: "Да", no: "Не", or: "ИЛИ", all: "Всички" },
    nav: { home: "Начало", reels: "Reels", trading: "Търговия", vip: "VIP", creator: "Създател", writers: "Писатели", profile: "Профил", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Меню" },
    auth: { welcomeBack: "Добре дошъл отново", joinMaraAI: "Присъедини се към MaraAI", email: "Имейл", password: "Парола", yourName: "Твоето име", login: "Вход", createAccount: "Създай акаунт", noAccount: "Нямаш акаунт?", signUp: "Регистрирай се", hasAccount: "Вече имаш акаунт?", logIn: "Влез", or: "ИЛИ" },
    chat: { title: "Чат с Mara", placeholder: "Напиши съобщение...", send: "Изпрати", welcome: "👋 Здравей {{name}}! Аз съм Mara, твоят умен асистент. Как мога да помогна?", welcomeGuest: "👋 Здравей! Аз съм Mara. Как мога да помогна?", errorMsg: "Съжалявам, възникна грешка. Опитай отново.", typing: "Mara пише...", chatError: "Грешка при свързване. Опитай отново." },
    languageSelector: { label: "Език", changeLanguage: "Смени езика" }
  },
  hr: {
    common: { close: "Zatvori", save: "Spremi", cancel: "Odustani", delete: "Obriši", edit: "Uredi", loading: "Učitavanje...", error: "Greška", success: "Uspjeh", submit: "Pošalji", back: "Natrag", next: "Dalje", search: "Traži", noResults: "Nema rezultata", retry: "Pokušaj ponovno", confirm: "Potvrdi", yes: "Da", no: "Ne", or: "ILI", all: "Sve" },
    nav: { home: "Početna", reels: "Reels", trading: "Trgovanje", vip: "VIP", creator: "Kreator", writers: "Pisci", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Izbornik" },
    auth: { welcomeBack: "Dobro došli natrag", joinMaraAI: "Pridružite se MaraAI", email: "Email", password: "Lozinka", yourName: "Vaše ime", login: "Prijava", createAccount: "Stvori račun", noAccount: "Nemate račun?", signUp: "Registrirajte se", hasAccount: "Već imate račun?", logIn: "Prijavite se", or: "ILI" },
    chat: { title: "Chat s Mara", placeholder: "Napišite poruku...", send: "Pošalji", welcome: "👋 Bok {{name}}! Ja sam Mara, vaš pametni asistent. Kako vam mogu pomoći?", welcomeGuest: "👋 Bok! Ja sam Mara. Kako vam mogu pomoći?", errorMsg: "Žao mi je, došlo je do greške. Pokušajte ponovno.", typing: "Mara piše...", chatError: "Greška veze. Pokušajte ponovno." },
    languageSelector: { label: "Jezik", changeLanguage: "Promijeni jezik" }
  },
  sr: {
    common: { close: "Затвори", save: "Сачувај", cancel: "Откажи", delete: "Обриши", edit: "Уреди", loading: "Учитавање...", error: "Грешка", success: "Успех", submit: "Пошаљи", back: "Назад", next: "Даље", search: "Претражи", noResults: "Нема резултата", retry: "Покушај поново", confirm: "Потврди", yes: "Да", no: "Не", or: "ИЛИ", all: "Све" },
    nav: { home: "Почетна", reels: "Reels", trading: "Трговање", vip: "VIP", creator: "Креатор", writers: "Писци", profile: "Профил", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Мени" },
    auth: { welcomeBack: "Добро дошли назад", joinMaraAI: "Придружите се MaraAI", email: "Имејл", password: "Лозинка", login: "Пријава", createAccount: "Направи налог", noAccount: "Немате налог?", signUp: "Региструјте се", hasAccount: "Већ имате налог?", logIn: "Пријавите се", or: "ИЛИ" },
    chat: { title: "Ћаскање са Mara", placeholder: "Напишите поруку...", send: "Пошаљи", welcome: "👋 Здраво {{name}}! Ја сам Mara, ваш паметни асистент. Како могу да помогнем?", welcomeGuest: "👋 Здраво! Ја сам Mara. Како могу да помогнем?", errorMsg: "Извините, дошло је до грешке. Покушајте поново.", typing: "Mara пише...", chatError: "Грешка везе. Покушајте поново." },
    languageSelector: { label: "Језик", changeLanguage: "Промени језик" }
  },
  tr: {
    common: { close: "Kapat", save: "Kaydet", cancel: "İptal", delete: "Sil", edit: "Düzenle", loading: "Yükleniyor...", error: "Hata", success: "Başarılı", submit: "Gönder", back: "Geri", next: "İleri", search: "Ara", noResults: "Sonuç bulunamadı", retry: "Tekrar dene", confirm: "Onayla", yes: "Evet", no: "Hayır", or: "VEYA", all: "Tümü" },
    nav: { home: "Ana Sayfa", reels: "Reels", trading: "Ticaret", vip: "VIP", creator: "İçerik Üretici", writers: "Yazarlar", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menü" },
    auth: { welcomeBack: "Tekrar hoş geldiniz", joinMaraAI: "MaraAI'ye katılın", email: "E-posta", password: "Şifre", yourName: "Adınız", login: "Giriş yap", createAccount: "Hesap oluştur", noAccount: "Hesabınız yok mu?", signUp: "Kayıt ol", hasAccount: "Zaten hesabınız var mı?", logIn: "Giriş yapın", or: "VEYA" },
    chat: { title: "Mara ile Sohbet", placeholder: "Mesajınızı yazın...", send: "Gönder", welcome: "👋 Merhaba {{name}}! Ben Mara, akıllı asistanınız. Size nasıl yardımcı olabilirim?", welcomeGuest: "👋 Merhaba! Ben Mara. Nasıl yardımcı olabilirim?", errorMsg: "Üzgünüm, bir hata oluştu. Tekrar deneyin.", typing: "Mara yazıyor...", chatError: "Bağlantı hatası. Tekrar deneyin." },
    languageSelector: { label: "Dil", changeLanguage: "Dili değiştir" }
  },
  ar: {
    common: { close: "إغلاق", save: "حفظ", cancel: "إلغاء", delete: "حذف", edit: "تعديل", loading: "...جاري التحميل", error: "خطأ", success: "نجاح", submit: "إرسال", back: "رجوع", next: "التالي", search: "بحث", noResults: "لا توجد نتائج", retry: "إعادة المحاولة", confirm: "تأكيد", yes: "نعم", no: "لا", or: "أو", all: "الكل" },
    nav: { home: "الرئيسية", reels: "ريلز", trading: "التداول", vip: "VIP", creator: "المنشئ", writers: "الكتّاب", profile: "الملف الشخصي", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "القائمة" },
    auth: { welcomeBack: "مرحبًا بعودتك", joinMaraAI: "انضم إلى MaraAI", email: "البريد الإلكتروني", password: "كلمة المرور", yourName: "اسمك", login: "تسجيل الدخول", createAccount: "إنشاء حساب", noAccount: "ليس لديك حساب؟", signUp: "سجّل", hasAccount: "لديك حساب بالفعل؟", logIn: "قم بتسجيل الدخول", or: "أو" },
    chat: { title: "الدردشة مع مارا", placeholder: "...اكتب رسالتك", send: "إرسال", welcome: "👋 مرحبًا {{name}}! أنا مارا، مساعدك الذكي. كيف يمكنني مساعدتك؟", welcomeGuest: "👋 مرحبًا! أنا مارا. كيف يمكنني المساعدة؟", errorMsg: "عذرًا، حدث خطأ. حاول مرة أخرى.", typing: "...مارا تكتب", chatError: "خطأ في الاتصال. حاول مرة أخرى." },
    languageSelector: { label: "اللغة", changeLanguage: "تغيير اللغة" }
  },
  hi: {
    common: { close: "बंद करें", save: "सहेजें", cancel: "रद्द करें", delete: "हटाएं", edit: "संपादित करें", loading: "लोड हो रहा है...", error: "त्रुटि", success: "सफल", submit: "जमा करें", back: "वापस", next: "अगला", search: "खोजें", noResults: "कोई परिणाम नहीं", retry: "पुनः प्रयास करें", confirm: "पुष्टि करें", yes: "हाँ", no: "नहीं", or: "या", all: "सभी" },
    nav: { home: "होम", reels: "रील्स", trading: "ट्रेडिंग", vip: "VIP", creator: "क्रिएटर", writers: "लेखक", profile: "प्रोफ़ाइल", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "मेनू" },
    auth: { welcomeBack: "वापस स्वागत है", joinMaraAI: "MaraAI में शामिल हों", email: "ईमेल", password: "पासवर्ड", yourName: "आपका नाम", login: "लॉगिन", createAccount: "खाता बनाएं", noAccount: "खाता नहीं है?", signUp: "साइन अप करें", hasAccount: "पहले से खाता है?", logIn: "लॉग इन करें", or: "या" },
    chat: { title: "मारा से चैट", placeholder: "अपना संदेश लिखें...", send: "भेजें", welcome: "👋 नमस्ते {{name}}! मैं मारा हूँ, आपका स्मार्ट सहायक। मैं कैसे मदद कर सकती हूँ?", welcomeGuest: "👋 नमस्ते! मैं मारा हूँ। कैसे मदद कर सकती हूँ?", errorMsg: "क्षमा करें, एक त्रुटि हुई। पुनः प्रयास करें।", typing: "मारा लिख रही है...", chatError: "कनेक्शन त्रुटि। पुनः प्रयास करें।" },
    languageSelector: { label: "भाषा", changeLanguage: "भाषा बदलें" }
  },
  ja: {
    common: { close: "閉じる", save: "保存", cancel: "キャンセル", delete: "削除", edit: "編集", loading: "読み込み中...", error: "エラー", success: "成功", submit: "送信", back: "戻る", next: "次へ", search: "検索", noResults: "結果なし", retry: "再試行", confirm: "確認", yes: "はい", no: "いいえ", or: "または", all: "すべて" },
    nav: { home: "ホーム", reels: "リール", trading: "トレーディング", vip: "VIP", creator: "クリエイター", writers: "ライター", profile: "プロフィール", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "メニュー" },
    auth: { welcomeBack: "おかえりなさい", joinMaraAI: "MaraAIに参加", email: "メール", password: "パスワード", yourName: "お名前", login: "ログイン", createAccount: "アカウント作成", noAccount: "アカウントをお持ちでない方", signUp: "新規登録", hasAccount: "アカウントをお持ちの方", logIn: "ログイン", or: "または" },
    chat: { title: "Maraとチャット", placeholder: "メッセージを入力...", send: "送信", welcome: "👋 こんにちは{{name}}さん！Maraです。どのようにお手伝いできますか？", welcomeGuest: "👋 こんにちは！Maraです。お手伝いできますか？", errorMsg: "申し訳ありません、エラーが発生しました。もう一度お試しください。", typing: "Maraが入力中...", chatError: "接続エラー。もう一度お試しください。" },
    languageSelector: { label: "言語", changeLanguage: "言語を変更" }
  },
  ko: {
    common: { close: "닫기", save: "저장", cancel: "취소", delete: "삭제", edit: "편집", loading: "로딩 중...", error: "오류", success: "성공", submit: "제출", back: "뒤로", next: "다음", search: "검색", noResults: "결과 없음", retry: "다시 시도", confirm: "확인", yes: "예", no: "아니오", or: "또는", all: "전체" },
    nav: { home: "홈", reels: "릴스", trading: "트레이딩", vip: "VIP", creator: "크리에이터", writers: "작가", profile: "프로필", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "메뉴" },
    auth: { welcomeBack: "돌아오셨군요", joinMaraAI: "MaraAI 가입", email: "이메일", password: "비밀번호", yourName: "이름", login: "로그인", createAccount: "계정 만들기", noAccount: "계정이 없으신가요?", signUp: "가입하기", hasAccount: "이미 계정이 있으신가요?", logIn: "로그인", or: "또는" },
    chat: { title: "Mara와 채팅", placeholder: "메시지를 입력하세요...", send: "보내기", welcome: "👋 안녕하세요 {{name}}님! Mara입니다. 어떻게 도와드릴까요?", welcomeGuest: "👋 안녕하세요! Mara입니다. 어떻게 도와드릴까요?", errorMsg: "죄송합니다, 오류가 발생했습니다. 다시 시도해주세요.", typing: "Mara가 입력 중...", chatError: "연결 오류. 다시 시도해주세요." },
    languageSelector: { label: "언어", changeLanguage: "언어 변경" }
  },
  zh: {
    common: { close: "关闭", save: "保存", cancel: "取消", delete: "删除", edit: "编辑", loading: "加载中...", error: "错误", success: "成功", submit: "提交", back: "返回", next: "下一步", search: "搜索", noResults: "无结果", retry: "重试", confirm: "确认", yes: "是", no: "否", or: "或", all: "全部" },
    nav: { home: "首页", reels: "短视频", trading: "交易", vip: "VIP", creator: "创作者", writers: "作家", profile: "个人资料", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "菜单" },
    auth: { welcomeBack: "欢迎回来", joinMaraAI: "加入MaraAI", email: "邮箱", password: "密码", yourName: "您的姓名", login: "登录", createAccount: "创建账户", noAccount: "没有账户？", signUp: "注册", hasAccount: "已有账户？", logIn: "登录", or: "或" },
    chat: { title: "与Mara聊天", placeholder: "输入消息...", send: "发送", welcome: "👋 你好 {{name}}！我是Mara，你的智能助手。有什么可以帮你的吗？", welcomeGuest: "👋 你好！我是Mara。有什么可以帮你的吗？", errorMsg: "抱歉，出现错误。请重试。", typing: "Mara正在输入...", chatError: "连接错误。请重试。" },
    languageSelector: { label: "语言", changeLanguage: "更改语言" }
  },
  th: {
    common: { close: "ปิด", save: "บันทึก", cancel: "ยกเลิก", delete: "ลบ", edit: "แก้ไข", loading: "กำลังโหลด...", error: "ข้อผิดพลาด", success: "สำเร็จ", submit: "ส่ง", back: "กลับ", next: "ถัดไป", search: "ค้นหา", noResults: "ไม่พบผลลัพธ์", retry: "ลองอีกครั้ง", confirm: "ยืนยัน", yes: "ใช่", no: "ไม่", or: "หรือ", all: "ทั้งหมด" },
    nav: { home: "หน้าแรก", reels: "รีลส์", trading: "เทรดดิ้ง", vip: "VIP", creator: "ครีเอเตอร์", writers: "นักเขียน", profile: "โปรไฟล์", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "เมนู" },
    auth: { welcomeBack: "ยินดีต้อนรับกลับ", joinMaraAI: "เข้าร่วม MaraAI", email: "อีเมล", password: "รหัสผ่าน", yourName: "ชื่อของคุณ", login: "เข้าสู่ระบบ", createAccount: "สร้างบัญชี", noAccount: "ยังไม่มีบัญชี?", signUp: "สมัคร", hasAccount: "มีบัญชีแล้ว?", logIn: "เข้าสู่ระบบ", or: "หรือ" },
    chat: { title: "แชทกับ Mara", placeholder: "เขียนข้อความ...", send: "ส่ง", welcome: "👋 สวัสดี {{name}}! ฉันคือ Mara ผู้ช่วยอัจฉริยะของคุณ ช่วยอะไรได้บ้าง?", welcomeGuest: "👋 สวัสดี! ฉันคือ Mara ช่วยอะไรได้บ้าง?", errorMsg: "ขอโทษ เกิดข้อผิดพลาด กรุณาลองอีกครั้ง", typing: "Mara กำลังพิมพ์...", chatError: "ข้อผิดพลาดในการเชื่อมต่อ กรุณาลองอีกครั้ง" },
    languageSelector: { label: "ภาษา", changeLanguage: "เปลี่ยนภาษา" }
  },
  vi: {
    common: { close: "Đóng", save: "Lưu", cancel: "Hủy", delete: "Xóa", edit: "Sửa", loading: "Đang tải...", error: "Lỗi", success: "Thành công", submit: "Gửi", back: "Quay lại", next: "Tiếp", search: "Tìm kiếm", noResults: "Không có kết quả", retry: "Thử lại", confirm: "Xác nhận", yes: "Có", no: "Không", or: "HOẶC", all: "Tất cả" },
    nav: { home: "Trang chủ", reels: "Reels", trading: "Giao dịch", vip: "VIP", creator: "Nhà sáng tạo", writers: "Nhà văn", profile: "Hồ sơ", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    auth: { welcomeBack: "Chào mừng trở lại", joinMaraAI: "Tham gia MaraAI", email: "Email", password: "Mật khẩu", yourName: "Tên của bạn", login: "Đăng nhập", createAccount: "Tạo tài khoản", noAccount: "Chưa có tài khoản?", signUp: "Đăng ký", hasAccount: "Đã có tài khoản?", logIn: "Đăng nhập", or: "HOẶC" },
    chat: { title: "Chat với Mara", placeholder: "Viết tin nhắn...", send: "Gửi", welcome: "👋 Xin chào {{name}}! Tôi là Mara, trợ lý thông minh của bạn. Tôi có thể giúp gì?", welcomeGuest: "👋 Xin chào! Tôi là Mara. Tôi có thể giúp gì?", errorMsg: "Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.", typing: "Mara đang nhập...", chatError: "Lỗi kết nối. Vui lòng thử lại." },
    languageSelector: { label: "Ngôn ngữ", changeLanguage: "Đổi ngôn ngữ" }
  },
  sv: {
    common: { close: "Stäng", save: "Spara", cancel: "Avbryt", delete: "Radera", edit: "Redigera", loading: "Laddar...", error: "Fel", success: "Lyckades", submit: "Skicka", back: "Tillbaka", next: "Nästa", search: "Sök", noResults: "Inga resultat", retry: "Försök igen", confirm: "Bekräfta", yes: "Ja", no: "Nej", or: "ELLER", all: "Alla" },
    nav: { home: "Hem", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Skapare", writers: "Författare", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Meny" },
    auth: { welcomeBack: "Välkommen tillbaka", joinMaraAI: "Gå med i MaraAI", email: "E-post", password: "Lösenord", yourName: "Ditt namn", login: "Logga in", createAccount: "Skapa konto", noAccount: "Inget konto?", signUp: "Registrera", hasAccount: "Har redan konto?", logIn: "Logga in", or: "ELLER" },
    chat: { title: "Chatta med Mara", placeholder: "Skriv ditt meddelande...", send: "Skicka", welcome: "👋 Hej {{name}}! Jag är Mara, din smarta assistent. Hur kan jag hjälpa dig?", welcomeGuest: "👋 Hej! Jag är Mara. Hur kan jag hjälpa?", errorMsg: "Tyvärr inträffade ett fel. Försök igen.", typing: "Mara skriver...", chatError: "Anslutningsfel. Försök igen." },
    languageSelector: { label: "Språk", changeLanguage: "Byt språk" }
  },
  da: {
    common: { close: "Luk", save: "Gem", cancel: "Annuller", delete: "Slet", edit: "Rediger", loading: "Indlæser...", error: "Fejl", success: "Succes", submit: "Send", back: "Tilbage", next: "Næste", search: "Søg", noResults: "Ingen resultater", retry: "Prøv igen", confirm: "Bekræft", yes: "Ja", no: "Nej", or: "ELLER", all: "Alle" },
    nav: { home: "Hjem", reels: "Reels", trading: "Trading", vip: "VIP", creator: "Skaber", writers: "Forfattere", profile: "Profil", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Menu" },
    auth: { welcomeBack: "Velkommen tilbage", joinMaraAI: "Tilmeld dig MaraAI", email: "Email", password: "Adgangskode", yourName: "Dit navn", login: "Log ind", createAccount: "Opret konto", noAccount: "Ingen konto?", signUp: "Tilmeld dig", hasAccount: "Har allerede en konto?", logIn: "Log ind", or: "ELLER" },
    chat: { title: "Chat med Mara", placeholder: "Skriv din besked...", send: "Send", welcome: "👋 Hej {{name}}! Jeg er Mara, din smarte assistent. Hvordan kan jeg hjælpe?", welcomeGuest: "👋 Hej! Jeg er Mara. Hvordan kan jeg hjælpe?", errorMsg: "Beklager, der opstod en fejl. Prøv igen.", typing: "Mara skriver...", chatError: "Forbindelsesfejl. Prøv igen." },
    languageSelector: { label: "Sprog", changeLanguage: "Skift sprog" }
  },
  el: {
    common: { close: "Κλείσιμο", save: "Αποθήκευση", cancel: "Ακύρωση", delete: "Διαγραφή", edit: "Επεξεργασία", loading: "Φόρτωση...", error: "Σφάλμα", success: "Επιτυχία", submit: "Υποβολή", back: "Πίσω", next: "Επόμενο", search: "Αναζήτηση", noResults: "Δεν βρέθηκαν αποτελέσματα", retry: "Επανάληψη", confirm: "Επιβεβαίωση", yes: "Ναι", no: "Όχι", or: "Ή", all: "Όλα" },
    nav: { home: "Αρχική", reels: "Reels", trading: "Συναλλαγές", vip: "VIP", creator: "Δημιουργός", writers: "Συγγραφείς", profile: "Προφίλ", brand: "MARAAI", brandMobile: "MARA", toggleMenu: "Μενού" },
    auth: { welcomeBack: "Καλώς ήρθατε ξανά", joinMaraAI: "Εγγραφείτε στο MaraAI", email: "Email", password: "Κωδικός", yourName: "Το όνομά σας", login: "Σύνδεση", createAccount: "Δημιουργία λογαριασμού", noAccount: "Δεν έχετε λογαριασμό;", signUp: "Εγγραφή", hasAccount: "Έχετε ήδη λογαριασμό;", logIn: "Σύνδεση", or: "Ή" },
    chat: { title: "Συνομιλία με Mara", placeholder: "Γράψτε το μήνυμά σας...", send: "Αποστολή", welcome: "👋 Γεια σας {{name}}! Είμαι η Mara, ο έξυπνος βοηθός σας. Πώς μπορώ να βοηθήσω;", welcomeGuest: "👋 Γεια! Είμαι η Mara. Πώς μπορώ να βοηθήσω;", errorMsg: "Λυπάμαι, προέκυψε σφάλμα. Δοκιμάστε ξανά.", typing: "Η Mara γράφει...", chatError: "Σφάλμα σύνδεσης. Δοκιμάστε ξανά." },
    languageSelector: { label: "Γλώσσα", changeLanguage: "Αλλαγή γλώσσας" }
  }
};

// Deep merge: base (en) + overrides from translation
function deepMerge(base, overrides) {
  const result = JSON.parse(JSON.stringify(base));
  for (const key of Object.keys(overrides)) {
    if (typeof overrides[key] === 'object' && overrides[key] !== null && !Array.isArray(overrides[key])) {
      result[key] = deepMerge(result[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

const outDir = path.join(__dirname, 'locales');

for (const [lang, overrides] of Object.entries(translations)) {
  const merged = deepMerge(en, overrides);
  // Keep the languages section from en.json (language names are universal)
  const filePath = path.join(outDir, `${lang}.json`);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`✅ Generated ${lang}.json`);
}

console.log(`\nDone! Generated ${Object.keys(translations).length} language files.`);
