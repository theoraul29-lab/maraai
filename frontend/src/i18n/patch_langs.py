#!/usr/bin/env python3
"""
Patches generate-langs.py with:
1. Missions / onboarding / pwa / messenger / chatbox / p2p / share / missionShare / community
   for all 10 comprehensive languages.
2. Complete OVERRIDES for 14 partial languages.
3. Privacy policy section for all languages.
Inserts just before AUTH_ERRORS dict.
"""
from pathlib import Path

SRC = Path(__file__).parent / "generate-langs.py"
text = SRC.read_text(encoding="utf-8")

INSERTION = r'''
# ---------------------------------------------------------------------------
# SMALL MISSING SECTIONS for comprehensive languages
# (p2p, missionShare, messenger, pwa, chatbox, share, community)
# ---------------------------------------------------------------------------

_SMALL_SECTIONS = {
    "ro": {
        "p2p": {
            "badgeTitle": "Contribui la Mara: {{tasks}} sarcini, {{xp}} XP",
            "contributing": "Contribui la Mara 🟢",
        },
        "missionShare": {
            "cardLabel": "Misiune completată",
            "share": "Distribuie",
            "referralLabel": "Codul tău de invitație:",
            "shareTitle": "Misiune completată pe Mara!",
            "shareText": "Am finalizat misiunea \"{{title}}\" pe Mara și am câștigat +{{xp}} XP! {{emoji}}\n\nÎncearcă și tu: {{url}}",
            "copied": "Textul a fost copiat în clipboard!",
        },
        "messenger": {
            "title": "💬 Mesaje", "close": "Închide", "loading": "Se încarcă…",
            "noConversations": "Nicio conversație.", "userFallback": "Utilizator",
            "selectConversation": "Selectează o conversație",
            "messagePlaceholder": "Scrie un mesaj…",
        },
        "pwa": {
            "installTitle": "Instalează Mara", "installBody": "Adaugă hellomara.net pe ecranul de start pentru o experiență de aplicație full-screen.",
            "installCta": "Instalează", "installDismiss": "Nu acum",
            "installDismissAria": "Respinge promptul de instalare",
            "iosHintTitle": "Instalează Mara", "iosHintBody": "Apasă Share, apoi „Adaugă pe ecranul de start" pentru a instala aplicația.",
            "iosHintDismiss": "Am înțeles", "updateTitle": "Actualizare disponibilă",
            "updateBody": "O versiune mai nouă a Marei este disponibilă.",
            "updateCta": "Reîncarcă", "updateDismissAria": "Respinge actualizarea",
        },
        "chatbox": {
            "offline": "Serverul Mara este offline sau inaccesibil.",
            "open": "Deschide Chat", "close": "Închide Chat",
            "placeholder": "Scrie un mesaj...", "send": "Trimite",
            "loading": "Se încarcă...", "processing": "MARA procesează...",
            "systemReady": "Sistem pregătit în {{lang}}.",
            "langTitle": "LIMBĂ", "error": "Ceva nu a mers bine. Încearcă din nou.",
        },
        "share": {
            "title": "Distribuie", "trigger": "↗ Distribuie", "close": "Închide",
            "copied": "Link copiat! 🔗", "instagramHint": "copiază + deschide",
            "tiktokHint": "copiază + deschide",
            "instagramMsg": "Link copiat! Deschide Instagram și lipește. 📸",
            "tiktokMsg": "Link copiat! Deschide TikTok și lipește. 🎵",
            "successMsg": "Distribuit! +25 XP 🎉", "errorMsg": "Eroare la distribuire. Încearcă din nou.",
            "recentlyShared": "Deja distribuit recent.",
            "platforms": {
                "hellomara": "Feed Mara", "you": "Profilul meu",
                "instagram": "Instagram", "tiktok": "TikTok",
                "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram",
                "link": "Copiază link",
            },
        },
        "community": {
            "subtitle": "Articole, misiuni și jurnale de comunitate",
            "searchPlaceholder": "🔍 Caută în feed...",
            "loading": "Se încarcă feed-ul...", "empty": "Nicio postare găsită",
            "emptySearch": "pentru această căutare",
            "articleBadge": "📚 Articol", "missionBadge": "🎯 Misiune",
            "journalBadge": "📓 Jurnal", "completed": "completat",
            "anonymous": "Anonim", "day": "Ziua", "justNow": "acum",
            "daySuffix": "z", "like": "Apreciază",
            "alreadyLiked": "Ai apreciat deja", "loginToLike": "Autentifică-te pentru a aprecia",
            "tab": {"all": "📋 Toate", "articles": "📚 Articole", "missions": "🎯 Misiuni", "journal": "📓 Jurnal"},
        },
    },
    "de": {
        "p2p": {"badgeTitle": "Beitrag zu Mara: {{tasks}} Aufgaben, {{xp}} XP", "contributing": "Beitrag zu Mara 🟢"},
        "missionShare": {
            "cardLabel": "Mission abgeschlossen", "share": "Teilen",
            "referralLabel": "Dein Einladungscode:", "shareTitle": "Mission auf Mara abgeschlossen!",
            "shareText": "Ich habe die Mission \"{{title}}\" auf Mara abgeschlossen und +{{xp}} XP verdient! {{emoji}}\n\nProbiere es auch: {{url}}",
            "copied": "Text in Zwischenablage kopiert!",
        },
        "messenger": {
            "title": "💬 Nachrichten", "close": "Schließen", "loading": "Lädt…",
            "noConversations": "Keine Unterhaltungen.", "userFallback": "Nutzer",
            "selectConversation": "Unterhaltung auswählen", "messagePlaceholder": "Nachricht schreiben…",
        },
        "pwa": {
            "installTitle": "Mara installieren", "installBody": "Füge hellomara.net zum Startbildschirm hinzu.",
            "installCta": "Installieren", "installDismiss": "Nicht jetzt",
            "installDismissAria": "Installationshinweis schließen",
            "iosHintTitle": "Mara installieren", "iosHintBody": "Tippe auf Teilen, dann „Zum Home-Bildschirm".",
            "iosHintDismiss": "Verstanden", "updateTitle": "Update bereit",
            "updateBody": "Eine neuere Version von Mara ist verfügbar.",
            "updateCta": "Neu laden", "updateDismissAria": "Update schließen",
        },
        "chatbox": {
            "offline": "Mara-Server ist offline oder nicht erreichbar.",
            "open": "Chat öffnen", "close": "Chat schließen",
            "placeholder": "Nachricht schreiben...", "send": "Senden",
            "loading": "Lädt...", "processing": "MARA verarbeitet...",
            "systemReady": "System bereit in {{lang}}.",
            "langTitle": "SPRACHE", "error": "Etwas ist schiefgelaufen. Erneut versuchen.",
        },
        "share": {
            "title": "Teilen", "trigger": "↗ Teilen", "close": "Schließen",
            "copied": "Link kopiert! 🔗", "instagramHint": "kopieren + öffnen",
            "tiktokHint": "kopieren + öffnen",
            "instagramMsg": "Link kopiert! Instagram öffnen und einfügen. 📸",
            "tiktokMsg": "Link kopiert! TikTok öffnen und einfügen. 🎵",
            "successMsg": "Geteilt! +25 XP 🎉", "errorMsg": "Fehler beim Teilen. Erneut versuchen.",
            "recentlyShared": "Kürzlich bereits geteilt.",
            "platforms": {"hellomara": "Mara-Feed", "you": "Mein Profil", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Link kopieren"},
        },
        "community": {
            "subtitle": "Artikel, Missionen und Community-Tagebücher",
            "searchPlaceholder": "🔍 Feed durchsuchen...",
            "loading": "Feed wird geladen...", "empty": "Keine Beiträge gefunden",
            "emptySearch": "für diese Suche",
            "articleBadge": "📚 Artikel", "missionBadge": "🎯 Mission",
            "journalBadge": "📓 Tagebuch", "completed": "abgeschlossen",
            "anonymous": "Anonym", "day": "Tag", "justNow": "jetzt",
            "daySuffix": "T", "like": "Gefällt mir",
            "alreadyLiked": "Bereits geliked", "loginToLike": "Anmelden zum Liken",
            "tab": {"all": "📋 Alle", "articles": "📚 Artikel", "missions": "🎯 Missionen", "journal": "📓 Tagebuch"},
        },
    },
    "fr": {
        "p2p": {"badgeTitle": "Contribution à Mara : {{tasks}} tâches, {{xp}} XP", "contributing": "Contribution à Mara 🟢"},
        "missionShare": {
            "cardLabel": "Mission accomplie", "share": "Partager",
            "referralLabel": "Ton code d'invitation :", "shareTitle": "Mission accomplie sur Mara !",
            "shareText": "J'ai accompli la mission \"{{title}}\" sur Mara et gagné +{{xp}} XP ! {{emoji}}\n\nEssaie aussi : {{url}}",
            "copied": "Texte copié dans le presse-papiers !",
        },
        "messenger": {
            "title": "💬 Messages", "close": "Fermer", "loading": "Chargement…",
            "noConversations": "Aucune conversation.", "userFallback": "Utilisateur",
            "selectConversation": "Sélectionner une conversation", "messagePlaceholder": "Écris un message…",
        },
        "pwa": {
            "installTitle": "Installer Mara", "installBody": "Ajoute hellomara.net à ton écran d'accueil.",
            "installCta": "Installer", "installDismiss": "Pas maintenant",
            "installDismissAria": "Ignorer l'invite d'installation",
            "iosHintTitle": "Installer Mara", "iosHintBody": "Appuie sur Partager puis « Ajouter à l'écran d'accueil ».",
            "iosHintDismiss": "Compris", "updateTitle": "Mise à jour disponible",
            "updateBody": "Une version plus récente de Mara est disponible.",
            "updateCta": "Actualiser", "updateDismissAria": "Ignorer la mise à jour",
        },
        "chatbox": {
            "offline": "Le serveur Mara est hors ligne.",
            "open": "Ouvrir le chat", "close": "Fermer le chat",
            "placeholder": "Écris un message...", "send": "Envoyer",
            "loading": "Chargement...", "processing": "MARA traite...",
            "systemReady": "Système prêt en {{lang}}.",
            "langTitle": "LANGUE", "error": "Quelque chose a mal tourné. Réessaie.",
        },
        "share": {
            "title": "Partager", "trigger": "↗ Partager", "close": "Fermer",
            "copied": "Lien copié ! 🔗", "instagramHint": "copier + ouvrir",
            "tiktokHint": "copier + ouvrir",
            "instagramMsg": "Lien copié ! Ouvre Instagram et colle. 📸",
            "tiktokMsg": "Lien copié ! Ouvre TikTok et colle. 🎵",
            "successMsg": "Partagé ! +25 XP 🎉", "errorMsg": "Erreur de partage. Réessaie.",
            "recentlyShared": "Déjà partagé récemment.",
            "platforms": {"hellomara": "Feed Mara", "you": "Mon profil", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Copier le lien"},
        },
        "community": {
            "subtitle": "Articles, missions et journaux communautaires",
            "searchPlaceholder": "🔍 Rechercher dans le feed...",
            "loading": "Chargement du feed...", "empty": "Aucune publication trouvée",
            "emptySearch": "pour cette recherche",
            "articleBadge": "📚 Article", "missionBadge": "🎯 Mission",
            "journalBadge": "📓 Journal", "completed": "accompli",
            "anonymous": "Anonyme", "day": "Jour", "justNow": "maintenant",
            "daySuffix": "j", "like": "J'aime",
            "alreadyLiked": "Déjà aimé", "loginToLike": "Connecte-toi pour aimer",
            "tab": {"all": "📋 Tout", "articles": "📚 Articles", "missions": "🎯 Missions", "journal": "📓 Journal"},
        },
    },
    "es": {
        "p2p": {"badgeTitle": "Contribuyendo a Mara: {{tasks}} tareas, {{xp}} XP", "contributing": "Contribuyendo a Mara 🟢"},
        "missionShare": {
            "cardLabel": "Misión completada", "share": "Compartir",
            "referralLabel": "Tu código de invitación:", "shareTitle": "¡Misión completada en Mara!",
            "shareText": "Completé la misión \"{{title}}\" en Mara y gané +{{xp}} XP! {{emoji}}\n\nInténtalo tú también: {{url}}",
            "copied": "¡Texto copiado al portapapeles!",
        },
        "messenger": {
            "title": "💬 Mensajes", "close": "Cerrar", "loading": "Cargando…",
            "noConversations": "Sin conversaciones.", "userFallback": "Usuario",
            "selectConversation": "Selecciona una conversación", "messagePlaceholder": "Escribe un mensaje…",
        },
        "pwa": {
            "installTitle": "Instalar Mara", "installBody": "Agrega hellomara.net a tu pantalla de inicio.",
            "installCta": "Instalar", "installDismiss": "Ahora no",
            "installDismissAria": "Descartar aviso de instalación",
            "iosHintTitle": "Instalar Mara", "iosHintBody": "Toca Compartir, luego «Agregar a inicio».",
            "iosHintDismiss": "Entendido", "updateTitle": "Actualización lista",
            "updateBody": "Hay una versión más nueva de Mara.",
            "updateCta": "Recargar", "updateDismissAria": "Descartar actualización",
        },
        "chatbox": {
            "offline": "El servidor Mara está fuera de línea.",
            "open": "Abrir chat", "close": "Cerrar chat",
            "placeholder": "Escribe un mensaje...", "send": "Enviar",
            "loading": "Cargando...", "processing": "MARA procesando...",
            "systemReady": "Sistema listo en {{lang}}.",
            "langTitle": "IDIOMA", "error": "Algo salió mal. Inténtalo de nuevo.",
        },
        "share": {
            "title": "Compartir", "trigger": "↗ Compartir", "close": "Cerrar",
            "copied": "¡Enlace copiado! 🔗", "instagramHint": "copiar + abrir",
            "tiktokHint": "copiar + abrir",
            "instagramMsg": "¡Enlace copiado! Abre Instagram y pega. 📸",
            "tiktokMsg": "¡Enlace copiado! Abre TikTok y pega. 🎵",
            "successMsg": "¡Compartido! +25 XP 🎉", "errorMsg": "Error al compartir. Inténtalo de nuevo.",
            "recentlyShared": "Ya compartido recientemente.",
            "platforms": {"hellomara": "Feed de Mara", "you": "Mi perfil", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Copiar enlace"},
        },
        "community": {
            "subtitle": "Artículos, misiones y diarios de la comunidad",
            "searchPlaceholder": "🔍 Buscar en el feed...",
            "loading": "Cargando feed...", "empty": "No se encontraron publicaciones",
            "emptySearch": "para esta búsqueda",
            "articleBadge": "📚 Artículo", "missionBadge": "🎯 Misión",
            "journalBadge": "📓 Diario", "completed": "completado",
            "anonymous": "Anónimo", "day": "Día", "justNow": "ahora",
            "daySuffix": "d", "like": "Me gusta",
            "alreadyLiked": "Ya te gustó", "loginToLike": "Inicia sesión para dar me gusta",
            "tab": {"all": "📋 Todo", "articles": "📚 Artículos", "missions": "🎯 Misiones", "journal": "📓 Diario"},
        },
    },
    "pt": {
        "p2p": {"badgeTitle": "Contribuindo com a Mara: {{tasks}} tarefas, {{xp}} XP", "contributing": "Contribuindo com a Mara 🟢"},
        "missionShare": {
            "cardLabel": "Missão completa", "share": "Compartilhar",
            "referralLabel": "Seu código de convite:", "shareTitle": "Missão completa na Mara!",
            "shareText": "Completei a missão \"{{title}}\" na Mara e ganhei +{{xp}} XP! {{emoji}}\n\nTente também: {{url}}",
            "copied": "Texto copiado para a área de transferência!",
        },
        "messenger": {
            "title": "💬 Mensagens", "close": "Fechar", "loading": "Carregando…",
            "noConversations": "Sem conversas.", "userFallback": "Usuário",
            "selectConversation": "Selecionar conversa", "messagePlaceholder": "Digite uma mensagem…",
        },
        "pwa": {
            "installTitle": "Instalar Mara", "installBody": "Adicione hellomara.net à tela inicial.",
            "installCta": "Instalar", "installDismiss": "Agora não",
            "installDismissAria": "Ignorar prompt de instalação",
            "iosHintTitle": "Instalar Mara", "iosHintBody": "Toque em Compartilhar, depois «Adicionar à tela de início».",
            "iosHintDismiss": "Entendido", "updateTitle": "Atualização disponível",
            "updateBody": "Uma versão mais recente da Mara está disponível.",
            "updateCta": "Recarregar", "updateDismissAria": "Ignorar atualização",
        },
        "chatbox": {
            "offline": "O servidor Mara está offline.", "open": "Abrir chat", "close": "Fechar chat",
            "placeholder": "Digite uma mensagem...", "send": "Enviar",
            "loading": "Carregando...", "processing": "MARA processando...",
            "systemReady": "Sistema pronto em {{lang}}.",
            "langTitle": "IDIOMA", "error": "Algo deu errado. Tente novamente.",
        },
        "share": {
            "title": "Compartilhar", "trigger": "↗ Compartilhar", "close": "Fechar",
            "copied": "Link copiado! 🔗", "instagramHint": "copiar + abrir",
            "tiktokHint": "copiar + abrir",
            "instagramMsg": "Link copiado! Abra o Instagram e cole. 📸",
            "tiktokMsg": "Link copiado! Abra o TikTok e cole. 🎵",
            "successMsg": "Compartilhado! +25 XP 🎉", "errorMsg": "Erro ao compartilhar. Tente novamente.",
            "recentlyShared": "Já compartilhado recentemente.",
            "platforms": {"hellomara": "Feed da Mara", "you": "Meu perfil", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Copiar link"},
        },
        "community": {
            "subtitle": "Artigos, missões e diários da comunidade",
            "searchPlaceholder": "🔍 Buscar no feed...",
            "loading": "Carregando feed...", "empty": "Nenhuma publicação encontrada",
            "emptySearch": "para esta busca",
            "articleBadge": "📚 Artigo", "missionBadge": "🎯 Missão",
            "journalBadge": "📓 Diário", "completed": "concluído",
            "anonymous": "Anônimo", "day": "Dia", "justNow": "agora",
            "daySuffix": "d", "like": "Curtir",
            "alreadyLiked": "Já curtido", "loginToLike": "Faça login para curtir",
            "tab": {"all": "📋 Tudo", "articles": "📚 Artigos", "missions": "🎯 Missões", "journal": "📓 Diário"},
        },
    },
    "ru": {
        "p2p": {"badgeTitle": "Вклад в Mara: {{tasks}} задач, {{xp}} XP", "contributing": "Вклад в Mara 🟢"},
        "missionShare": {
            "cardLabel": "Миссия выполнена", "share": "Поделиться",
            "referralLabel": "Твой реферальный код:", "shareTitle": "Миссия выполнена на Mara!",
            "shareText": "Я выполнил(а) миссию \"{{title}}\" на Mara и заработал(а) +{{xp}} XP! {{emoji}}\n\nПопробуй тоже: {{url}}",
            "copied": "Текст скопирован в буфер обмена!",
        },
        "messenger": {
            "title": "💬 Сообщения", "close": "Закрыть", "loading": "Загрузка…",
            "noConversations": "Нет диалогов.", "userFallback": "Пользователь",
            "selectConversation": "Выбери диалог", "messagePlaceholder": "Написать сообщение…",
        },
        "pwa": {
            "installTitle": "Установить Mara", "installBody": "Добавь hellomara.net на главный экран.",
            "installCta": "Установить", "installDismiss": "Не сейчас",
            "installDismissAria": "Закрыть подсказку об установке",
            "iosHintTitle": "Установить Mara", "iosHintBody": "Нажми «Поделиться», затем «На экран Домой».",
            "iosHintDismiss": "Понятно", "updateTitle": "Обновление готово",
            "updateBody": "Доступна новая версия Mara.",
            "updateCta": "Обновить", "updateDismissAria": "Закрыть обновление",
        },
        "chatbox": {
            "offline": "Сервер Mara недоступен.", "open": "Открыть чат", "close": "Закрыть чат",
            "placeholder": "Напиши сообщение...", "send": "Отправить",
            "loading": "Загрузка...", "processing": "MARA обрабатывает...",
            "systemReady": "Система готова на языке {{lang}}.",
            "langTitle": "ЯЗЫК", "error": "Что-то пошло не так. Попробуй снова.",
        },
        "share": {
            "title": "Поделиться", "trigger": "↗ Поделиться", "close": "Закрыть",
            "copied": "Ссылка скопирована! 🔗", "instagramHint": "скопировать + открыть",
            "tiktokHint": "скопировать + открыть",
            "instagramMsg": "Ссылка скопирована! Открой Instagram и вставь. 📸",
            "tiktokMsg": "Ссылка скопирована! Открой TikTok и вставь. 🎵",
            "successMsg": "Поделился! +25 XP 🎉", "errorMsg": "Ошибка. Попробуй снова.",
            "recentlyShared": "Недавно уже делился.",
            "platforms": {"hellomara": "Лента Mara", "you": "Мой профиль", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Копировать ссылку"},
        },
        "community": {
            "subtitle": "Статьи, миссии и дневники сообщества",
            "searchPlaceholder": "🔍 Поиск по ленте...",
            "loading": "Загрузка ленты...", "empty": "Публикаций не найдено",
            "emptySearch": "по этому запросу",
            "articleBadge": "📚 Статья", "missionBadge": "🎯 Миссия",
            "journalBadge": "📓 Дневник", "completed": "выполнено",
            "anonymous": "Аноним", "day": "День", "justNow": "сейчас",
            "daySuffix": "д", "like": "Нравится",
            "alreadyLiked": "Уже понравилось", "loginToLike": "Войди чтобы поставить лайк",
            "tab": {"all": "📋 Все", "articles": "📚 Статьи", "missions": "🎯 Миссии", "journal": "📓 Дневник"},
        },
    },
    "uk": {
        "p2p": {"badgeTitle": "Внесок у Mara: {{tasks}} завдань, {{xp}} XP", "contributing": "Внесок у Mara 🟢"},
        "missionShare": {
            "cardLabel": "Місію виконано", "share": "Поділитися",
            "referralLabel": "Твій реферальний код:", "shareTitle": "Місію виконано на Mara!",
            "shareText": "Я виконав(ла) місію \"{{title}}\" на Mara та заробив(ла) +{{xp}} XP! {{emoji}}\n\nСпробуй теж: {{url}}",
            "copied": "Текст скопійовано в буфер обміну!",
        },
        "messenger": {
            "title": "💬 Повідомлення", "close": "Закрити", "loading": "Завантаження…",
            "noConversations": "Немає розмов.", "userFallback": "Користувач",
            "selectConversation": "Обери розмову", "messagePlaceholder": "Написати повідомлення…",
        },
        "pwa": {
            "installTitle": "Встановити Mara", "installBody": "Додай hellomara.net на головний екран.",
            "installCta": "Встановити", "installDismiss": "Не зараз",
            "installDismissAria": "Закрити підказку про встановлення",
            "iosHintTitle": "Встановити Mara", "iosHintBody": "Натисни «Поділитися», потім «На головний екран».",
            "iosHintDismiss": "Зрозуміло", "updateTitle": "Оновлення готове",
            "updateBody": "Доступна новіша версія Mara.",
            "updateCta": "Оновити", "updateDismissAria": "Закрити оновлення",
        },
        "chatbox": {
            "offline": "Сервер Mara недоступний.", "open": "Відкрити чат", "close": "Закрити чат",
            "placeholder": "Напиши повідомлення...", "send": "Надіслати",
            "loading": "Завантаження...", "processing": "MARA обробляє...",
            "systemReady": "Система готова мовою {{lang}}.",
            "langTitle": "МОВА", "error": "Щось пішло не так. Спробуй ще раз.",
        },
        "share": {
            "title": "Поділитися", "trigger": "↗ Поділитися", "close": "Закрити",
            "copied": "Посилання скопійовано! 🔗", "instagramHint": "скопіювати + відкрити",
            "tiktokHint": "скопіювати + відкрити",
            "instagramMsg": "Посилання скопійовано! Відкрий Instagram та встав. 📸",
            "tiktokMsg": "Посилання скопійовано! Відкрий TikTok та встав. 🎵",
            "successMsg": "Поділився! +25 XP 🎉", "errorMsg": "Помилка. Спробуй ще раз.",
            "recentlyShared": "Нещодавно вже ділився.",
            "platforms": {"hellomara": "Стрічка Mara", "you": "Мій профіль", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Копіювати посилання"},
        },
        "community": {
            "subtitle": "Статті, місії та щоденники спільноти",
            "searchPlaceholder": "🔍 Пошук у стрічці...",
            "loading": "Завантаження стрічки...", "empty": "Публікацій не знайдено",
            "emptySearch": "за цим запитом",
            "articleBadge": "📚 Стаття", "missionBadge": "🎯 Місія",
            "journalBadge": "📓 Щоденник", "completed": "виконано",
            "anonymous": "Анонім", "day": "День", "justNow": "зараз",
            "daySuffix": "д", "like": "Подобається",
            "alreadyLiked": "Вже сподобалося", "loginToLike": "Увійди щоб поставити лайк",
            "tab": {"all": "📋 Усі", "articles": "📚 Статті", "missions": "🎯 Місії", "journal": "📓 Щоденник"},
        },
    },
    "ar": {
        "p2p": {"badgeTitle": "المساهمة في Mara: {{tasks}} مهمة، {{xp}} XP", "contributing": "مساهمة في Mara 🟢"},
        "missionShare": {
            "cardLabel": "تمت المهمة", "share": "مشاركة",
            "referralLabel": "كود دعوتك:", "shareTitle": "تمت المهمة على Mara!",
            "shareText": "أنجزت مهمة \"{{title}}\" على Mara وكسبت +{{xp}} XP! {{emoji}}\n\nجربها أنت أيضاً: {{url}}",
            "copied": "تم نسخ النص إلى الحافظة!",
        },
        "messenger": {
            "title": "💬 الرسائل", "close": "إغلاق", "loading": "جارٍ التحميل…",
            "noConversations": "لا محادثات.", "userFallback": "مستخدم",
            "selectConversation": "اختر محادثة", "messagePlaceholder": "اكتب رسالة…",
        },
        "pwa": {
            "installTitle": "تثبيت Mara", "installBody": "أضف hellomara.net إلى شاشتك الرئيسية.",
            "installCta": "تثبيت", "installDismiss": "ليس الآن",
            "installDismissAria": "إغلاق تلميح التثبيت",
            "iosHintTitle": "تثبيت Mara", "iosHintBody": "انقر على مشاركة ثم «إضافة إلى الشاشة الرئيسية».",
            "iosHintDismiss": "فهمت", "updateTitle": "تحديث جاهز",
            "updateBody": "يتوفر إصدار أحدث من Mara.",
            "updateCta": "تحديث", "updateDismissAria": "إغلاق التحديث",
        },
        "chatbox": {
            "offline": "خادم Mara غير متصل.", "open": "فتح الدردشة", "close": "إغلاق الدردشة",
            "placeholder": "اكتب رسالة...", "send": "إرسال",
            "loading": "جارٍ التحميل...", "processing": "MARA تعالج...",
            "systemReady": "النظام جاهز بـ{{lang}}.",
            "langTitle": "اللغة", "error": "حدث خطأ. حاول مرة أخرى.",
        },
        "share": {
            "title": "مشاركة", "trigger": "↗ مشاركة", "close": "إغلاق",
            "copied": "تم نسخ الرابط! 🔗", "instagramHint": "نسخ + فتح",
            "tiktokHint": "نسخ + فتح",
            "instagramMsg": "تم نسخ الرابط! افتح Instagram والصق. 📸",
            "tiktokMsg": "تم نسخ الرابط! افتح TikTok والصق. 🎵",
            "successMsg": "تمت المشاركة! +25 XP 🎉", "errorMsg": "خطأ في المشاركة. حاول مرة أخرى.",
            "recentlyShared": "شاركت مؤخراً.",
            "platforms": {"hellomara": "خلاصة Mara", "you": "ملفي", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "نسخ الرابط"},
        },
        "community": {
            "subtitle": "مقالات ومهام ويوميات المجتمع",
            "searchPlaceholder": "🔍 البحث في الخلاصة...",
            "loading": "جارٍ تحميل الخلاصة...", "empty": "لم يتم العثور على منشورات",
            "emptySearch": "لهذا البحث",
            "articleBadge": "📚 مقال", "missionBadge": "🎯 مهمة",
            "journalBadge": "📓 يوميات", "completed": "مكتمل",
            "anonymous": "مجهول", "day": "يوم", "justNow": "الآن",
            "daySuffix": "ي", "like": "إعجاب",
            "alreadyLiked": "أعجبك مسبقاً", "loginToLike": "سجل دخولك للإعجاب",
            "tab": {"all": "📋 الكل", "articles": "📚 مقالات", "missions": "🎯 مهام", "journal": "📓 يوميات"},
        },
    },
    "hi": {
        "p2p": {"badgeTitle": "Mara में योगदान: {{tasks}} कार्य, {{xp}} XP", "contributing": "Mara में योगदान 🟢"},
        "missionShare": {
            "cardLabel": "मिशन पूरा", "share": "साझा करें",
            "referralLabel": "आपका आमंत्रण कोड:", "shareTitle": "Mara पर मिशन पूरा!",
            "shareText": "मैंने Mara पर \"{{title}}\" मिशन पूरा किया और +{{xp}} XP अर्जित किए! {{emoji}}\n\nआप भी आज़माएं: {{url}}",
            "copied": "टेक्स्ट क्लिपबोर्ड में कॉपी हो गया!",
        },
        "messenger": {
            "title": "💬 संदेश", "close": "बंद करें", "loading": "लोड हो रहा है…",
            "noConversations": "कोई बातचीत नहीं।", "userFallback": "उपयोगकर्ता",
            "selectConversation": "बातचीत चुनें", "messagePlaceholder": "संदेश लिखें…",
        },
        "pwa": {
            "installTitle": "Mara इंस्टॉल करें", "installBody": "hellomara.net को होम स्क्रीन पर जोड़ें।",
            "installCta": "इंस्टॉल करें", "installDismiss": "अभी नहीं",
            "installDismissAria": "इंस्टॉल प्रॉम्प्ट बंद करें",
            "iosHintTitle": "Mara इंस्टॉल करें", "iosHintBody": "Share दबाएं, फिर «होम स्क्रीन में जोड़ें»।",
            "iosHintDismiss": "समझ गया", "updateTitle": "अपडेट तैयार है",
            "updateBody": "Mara का नया संस्करण उपलब्ध है।",
            "updateCta": "रीफ्रेश करें", "updateDismissAria": "अपडेट बंद करें",
        },
        "chatbox": {
            "offline": "Mara सर्वर ऑफ़लाइन है।", "open": "चैट खोलें", "close": "चैट बंद करें",
            "placeholder": "संदेश लिखें...", "send": "भेजें",
            "loading": "लोड हो रहा है...", "processing": "MARA प्रोसेस कर रहा है...",
            "systemReady": "{{lang}} में सिस्टम तैयार।",
            "langTitle": "भाषा", "error": "कुछ गलत हुआ। फिर प्रयास करें।",
        },
        "share": {
            "title": "साझा करें", "trigger": "↗ साझा करें", "close": "बंद करें",
            "copied": "लिंक कॉपी हो गया! 🔗", "instagramHint": "कॉपी + खोलें",
            "tiktokHint": "कॉपी + खोलें",
            "instagramMsg": "लिंक कॉपी हो गया! Instagram खोलें और पेस्ट करें। 📸",
            "tiktokMsg": "लिंक कॉपी हो गया! TikTok खोलें और पेस्ट करें। 🎵",
            "successMsg": "साझा किया! +25 XP 🎉", "errorMsg": "साझा करने में त्रुटि। फिर प्रयास करें।",
            "recentlyShared": "हाल ही में साझा किया।",
            "platforms": {"hellomara": "Mara फीड", "you": "मेरी प्रोफ़ाइल", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "लिंक कॉपी करें"},
        },
        "community": {
            "subtitle": "लेख, मिशन और सामुदायिक डायरी",
            "searchPlaceholder": "🔍 फीड में खोजें...",
            "loading": "फीड लोड हो रहा है...", "empty": "कोई पोस्ट नहीं मिली",
            "emptySearch": "इस खोज के लिए",
            "articleBadge": "📚 लेख", "missionBadge": "🎯 मिशन",
            "journalBadge": "📓 डायरी", "completed": "पूरा",
            "anonymous": "अज्ञात", "day": "दिन", "justNow": "अभी",
            "daySuffix": "द", "like": "पसंद",
            "alreadyLiked": "पहले से पसंद", "loginToLike": "पसंद करने के लिए लॉगिन करें",
            "tab": {"all": "📋 सभी", "articles": "📚 लेख", "missions": "🎯 मिशन", "journal": "📓 डायरी"},
        },
    },
    "ja": {
        "p2p": {"badgeTitle": "Mara への貢献: {{tasks}} タスク、{{xp}} XP", "contributing": "Mara に貢献中 🟢"},
        "missionShare": {
            "cardLabel": "ミッション完了", "share": "シェア",
            "referralLabel": "あなたの招待コード:", "shareTitle": "Mara でミッション完了！",
            "shareText": "Mara で「{{title}}」ミッションを完了し、+{{xp}} XP 獲得！ {{emoji}}\n\nあなたも試してみて: {{url}}",
            "copied": "テキストをクリップボードにコピーしました！",
        },
        "messenger": {
            "title": "💬 メッセージ", "close": "閉じる", "loading": "読み込み中…",
            "noConversations": "会話はありません。", "userFallback": "ユーザー",
            "selectConversation": "会話を選択", "messagePlaceholder": "メッセージを入力…",
        },
        "pwa": {
            "installTitle": "Mara をインストール", "installBody": "hellomara.net をホーム画面に追加。",
            "installCta": "インストール", "installDismiss": "今はしない",
            "installDismissAria": "インストールプロンプトを閉じる",
            "iosHintTitle": "Mara をインストール", "iosHintBody": "「共有」をタップして「ホーム画面に追加」。",
            "iosHintDismiss": "了解", "updateTitle": "アップデート準備完了",
            "updateBody": "Mara の新しいバージョンが利用可能です。",
            "updateCta": "リロード", "updateDismissAria": "アップデートを閉じる",
        },
        "chatbox": {
            "offline": "Maraサーバーはオフラインです。", "open": "チャットを開く", "close": "チャットを閉じる",
            "placeholder": "メッセージを入力...", "send": "送信",
            "loading": "読み込み中...", "processing": "MARA が処理中...",
            "systemReady": "{{lang}} でシステム準備完了。",
            "langTitle": "言語", "error": "問題が発生しました。もう一度お試しください。",
        },
        "share": {
            "title": "シェア", "trigger": "↗ シェア", "close": "閉じる",
            "copied": "リンクをコピーしました！ 🔗", "instagramHint": "コピー + 開く",
            "tiktokHint": "コピー + 開く",
            "instagramMsg": "リンクをコピーしました！Instagramを開いて貼り付けてください。 📸",
            "tiktokMsg": "リンクをコピーしました！TikTokを開いて貼り付けてください。 🎵",
            "successMsg": "シェアしました！ +25 XP 🎉", "errorMsg": "シェアエラー。もう一度お試しください。",
            "recentlyShared": "最近すでにシェアしました。",
            "platforms": {"hellomara": "Mara フィード", "you": "マイプロフィール", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "リンクをコピー"},
        },
        "community": {
            "subtitle": "記事、ミッション、コミュニティジャーナル",
            "searchPlaceholder": "🔍 フィードを検索...",
            "loading": "フィードを読み込み中...", "empty": "投稿が見つかりません",
            "emptySearch": "この検索では",
            "articleBadge": "📚 記事", "missionBadge": "🎯 ミッション",
            "journalBadge": "📓 ジャーナル", "completed": "完了",
            "anonymous": "匿名", "day": "日", "justNow": "今",
            "daySuffix": "日前", "like": "いいね",
            "alreadyLiked": "すでにいいね済み", "loginToLike": "いいねするにはログイン",
            "tab": {"all": "📋 すべて", "articles": "📚 記事", "missions": "🎯 ミッション", "journal": "📓 ジャーナル"},
        },
    },
}

# Apply small sections to comprehensive languages
for _lang, _secs in _SMALL_SECTIONS.items():
    if _lang in OVERRIDES:
        for _sec_name, _sec_data in _secs.items():
            OVERRIDES[_lang][_sec_name] = _sec_data

# ---------------------------------------------------------------------------
# PARTIAL LANGUAGES — complete OVERRIDES
# ---------------------------------------------------------------------------

def _base(common, nav, auth_login, auth_pw, auth_name, logout_lbl, settings_lbl,
          free_lbl, per_month, badge_pop, start_free, missions_lbl, day_lbl, days_lbl):
    """Build a minimal but complete overlay for a partial language."""
    return {
        "common": common,
        "nav": nav,
        "auth": {
            "welcomeBack": auth_login, "joinMaraAI": auth_name,
            "email": "Email", "password": auth_pw, "yourName": auth_name,
            "emailRequired": "Email is required",
            "emailInvalid": "Please enter a valid email",
            "passwordRequired": "Password is required",
            "passwordMinLength": "Password must be at least 8 characters",
            "nameRequired": "Name is required", "nameMinLength": "Name must be at least 2 characters",
            "passwordHint": "✓ Password must be at least 8 characters",
            "login": auth_login, "createAccount": "Create Account",
            "signingIn": "Signing in...", "creatingAccount": "Creating Account...",
            "google": "Google", "facebook": "Facebook",
            "noAccount": "Don't have an account?", "signUp": "Sign up",
            "hasAccount": "Already have an account?", "logIn": "Log in",
            "closeModal": "Close", "closeEsc": "Close (Esc)",
            "socialLogin": "Social login", "signInWith": "Sign in with {{provider}}",
            "switchToSignup": "Switch to sign up", "switchToLogin": "Switch to login",
            "or": "OR", "logout": logout_lbl, "logoutAriaLabel": logout_lbl,
            "earnings": "Earnings", "upgradeToPremium": "Upgrade to Premium",
            "upgradeAriaLabel": "Upgrade", "creatorPanel": "Creator Panel",
            "creatorAriaLabel": "Open creator panel",
            "profileMenuFor": "Profile menu for {{name}}",
            "loginOrSignup": "Log in or sign up", "forgotPassword": "Forgot password?",
        },
        "settings": {
            "title": settings_lbl, "closeAria": "Close",
            "sectionAccount": "Account", "sectionMaraAI": "MaraAI & Privacy",
            "sectionNotifications": "Notifications", "sectionPreferences": "Preferences",
            "changePassword": "Change password", "currentPassword": "Current password",
            "newPassword": "New password", "confirmNewPassword": "Confirm new password",
            "passwordChanged": "Password changed!",
            "pwConfirmError": "Passwords don't match.", "pwMinLengthError": "Min 8 characters.",
            "pwNetworkError": "Network error.", "pwSaving": "Saving…",
            "changePwBtn": "Change password", "logout": logout_lbl,
            "dangerZone": "Danger zone",
            "deleteAccountWarning": "Account deletion is irreversible.",
            "deleteAccountWarningSafe": "Account deletion is irreversible.",
            "deleteConfirmQuestion": "Are you sure?",
            "deleteConfirmBtn": "Yes, delete permanently",
            "deleting": "Deleting...", "cancelBtn": "Cancel",
            "deleteAccountBtn": "Delete account", "deleteError": "An error occurred.",
            "privacyLink": "Privacy policy", "modeTitle": "MaraAI Mode",
            "modeCentralized": "🏢 Centralized", "modeHybrid": "⚡ Hybrid", "modeAdvanced": "🌐 Advanced",
            "modeDescCentralized": "All through Mara servers.", "modeDescHybrid": "Hybrid P2P mode.",
            "modeDescAdvanced": "P2P priority.", "p2pNetwork": "P2P Network",
            "p2pParticipation": "P2P Participation", "p2pParticipationDesc": "Help the Mara network.",
            "backgroundNode": "Background node", "backgroundNodeDesc": "Runs in background.",
            "advancedAiRouting": "Advanced AI routing", "advancedAiRoutingDesc": "Auto-select best AI model.",
            "bandwidthShared": "Shared bandwidth", "bandwidthPerMonth": "{{gb}} GB/month",
            "saving": "Saving…", "loadError": "Could not load settings.",
            "notificationsTitle": "In-app notifications", "notificationsEnabled": "Notifications on",
            "notificationsDesc": "Get notified about missions and activity.",
            "notifLoadError": "Could not load settings.", "themeTitle": "Theme",
            "themeDark": "🌙 Dark", "themeLight": "☀️ Light", "languageTitle": "Language",
        },
        "cookie": {
            "ariaLabel": "Cookie information",
            "text": "We use only essential cookies. No tracking, no marketing.",
            "learnMore": "Learn more", "accept": "Got it", "closeAria": "Close",
        },
        "pricing": {
            "heroTitle": "Your transformation path", "heroSubtitle": "Simple. Monthly. No surprises.",
            "tierFreeTagline": "Start without a card.", "tierFreeChat": "Basic Mara AI chat",
            "tierFreeReels": "Community reels", "tierFreeArticles": "Read public articles",
            "tierFreeCommunity": "Community access", "tierFreeCta": start_free,
            "tierProTagline": "Everything to create and grow.",
            "tierProChat": "Unlimited Mara AI chat", "tierProReels": "Upload reels",
            "tierProArticles": "Publish public articles", "tierProProfile": "Public profile",
            "tierProAll": "All Free features", "tierProCta": "Choose Pro",
            "tierVipBadge": badge_pop, "tierVipTagline": "Transformation programs included.",
            "tierVipAll": "All Pro features", "tierVipReadVip": "Read VIP articles",
            "tierVipPublishVip": "Publish VIP articles", "tierVipAI": "Custom AI personality",
            "tierVipHD": "HD upload",
            "tierVipPrograms": "✦ All programs included",
            "tierVipCta": "Choose VIP", "tierCreatorTagline": "Monetize your content.",
            "tierCreatorAll": "All VIP features", "tierCreatorRevenue": "70% revenue share",
            "tierCreatorWithdraw": "Withdraw earnings", "tierCreatorAnalytics": "Detailed analytics",
            "tierCreatorPaid": "Publish paid articles", "tierCreatorMonetize": "Reel monetization",
            "tierCreatorCta": "Choose Creator", "perMonth": per_month, "free": free_lbl,
            "programsTitle": "Programs in VIP", "programsSubtitle": "All 6 transformation programs included.",
            "mindsetDesc": "1 day. A mindset shift.", "habitDesc": "21 days. A habit for life.",
            "skillsDesc": "90 days. A new skill.", "bodyDesc": "180 days. A new body and mind.",
            "lifeDesc": "365 days. A new life.", "youDesc": "1095 days. A new you.",
            "day": day_lbl, "days": days_lbl, "faqTitle": "FAQ",
            "faq1Q": "Can I cancel anytime?", "faq1A": "Yes, cancel anytime from settings.",
            "faq2Q": "How do VIP programs work?", "faq2A": "Full access to all 6 programs.",
            "faq3Q": "What if I miss a day?", "faq3A": "Mara keeps your progress. Streak resets.",
            "faq4Q": "How do I pay?", "faq4A": "Stripe or PayPal. Secure transaction.",
        },
        "missions": {"title": missions_lbl, "loginBtn": "Sign in"},
        "p2p": {"badgeTitle": "Contributing to Mara: {{tasks}} tasks, {{xp}} XP", "contributing": "Contributing to Mara 🟢"},
        "missionShare": {
            "cardLabel": "Mission complete", "share": "Share", "referralLabel": "Your invite code:",
            "shareTitle": "Mission complete on Mara!",
            "shareText": "I completed the mission \"{{title}}\" on Mara and earned +{{xp}} XP! {{emoji}}\n\nTry it too: {{url}}",
            "copied": "Text copied to clipboard!",
        },
        "messenger": {
            "title": "💬 Messages", "close": "Close", "loading": "Loading…",
            "noConversations": "No conversations.", "userFallback": "User",
            "selectConversation": "Select a conversation", "messagePlaceholder": "Write a message…",
        },
        "chatbox": {
            "offline": "Mara server is offline.", "open": "Open Chat", "close": "Close Chat",
            "placeholder": "Type a message...", "send": "Send", "loading": "Loading...",
            "processing": "MARA is processing...", "systemReady": "System ready in {{lang}}.",
            "langTitle": "LANGUAGE", "error": "Something went wrong. Try again.",
        },
        "pwa": {
            "installTitle": "Install Mara", "installBody": "Add hellomara.net to your home screen.",
            "installCta": "Install", "installDismiss": "Not now",
            "installDismissAria": "Dismiss", "iosHintTitle": "Install Mara",
            "iosHintBody": "Tap Share then Add to Home Screen.",
            "iosHintDismiss": "Got it", "updateTitle": "Update ready",
            "updateBody": "A newer version of Mara is available.",
            "updateCta": "Refresh", "updateDismissAria": "Dismiss update",
        },
        "share": {
            "title": "Share", "trigger": "↗ Share", "close": "Close",
            "copied": "Link copied! 🔗", "instagramHint": "copy + open", "tiktokHint": "copy + open",
            "instagramMsg": "Link copied! Open Instagram and paste. 📸",
            "tiktokMsg": "Link copied! Open TikTok and paste. 🎵",
            "successMsg": "Shared! +25 XP 🎉", "errorMsg": "Share failed. Try again.",
            "recentlyShared": "Already shared recently.",
            "platforms": {"hellomara": "Mara Feed", "you": "My Profile", "instagram": "Instagram", "tiktok": "TikTok", "x": "X", "whatsapp": "WhatsApp", "telegram": "Telegram", "link": "Copy Link"},
        },
        "community": {
            "subtitle": "Articles, missions and community journals",
            "searchPlaceholder": "🔍 Search feed...", "loading": "Loading feed...",
            "empty": "No posts found", "emptySearch": "for this search",
            "articleBadge": "📚 Article", "missionBadge": "🎯 Mission",
            "journalBadge": "📓 Journal", "completed": "completed",
            "anonymous": "Anonymous", "day": "Day", "justNow": "now",
            "daySuffix": "d", "like": "Like", "alreadyLiked": "Already liked",
            "loginToLike": "Log in to like",
            "tab": {"all": "📋 All", "articles": "📚 Articles", "missions": "🎯 Missions", "journal": "📓 Journal"},
        },
    }


OVERRIDES["it"] = _base(
    common={"close": "Chiudi", "save": "Salva", "cancel": "Annulla", "delete": "Elimina", "edit": "Modifica", "loading": "Caricamento...", "error": "Errore", "success": "Successo", "submit": "Invia", "back": "Indietro", "next": "Avanti", "search": "Cerca", "noResults": "Nessun risultato", "retry": "Riprova", "confirm": "Conferma", "yes": "Sì", "no": "No", "or": "O", "all": "Tutti"},
    nav={"home": "Home", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Creator", "writers": "Scrittori", "profile": "Profilo", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Missioni", "pricing": "Prezzi", "community": "Comunità"},
    auth_login="Accedi", auth_pw="Password", auth_name="Il tuo nome",
    logout_lbl="Esci", settings_lbl="⚙️ Impostazioni",
    free_lbl="Gratis", per_month="/mese", badge_pop="Il più popolare",
    start_free="Inizia gratis", missions_lbl="Missioni", day_lbl="giorno", days_lbl="giorni",
)
OVERRIDES["it"].update({
    "nav": {"home": "Home", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Creator", "writers": "Scrittori", "profile": "Profilo", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Missioni", "pricing": "Prezzi", "community": "Comunità"},
    "chat": {"title": "Chat con Mara", "placeholder": "Scrivi un messaggio...", "send": "Invia", "welcome": "👋 Ciao {{name}}! Sono Mara, la tua assistente intelligente. Come posso aiutarti?", "welcomeGuest": "👋 Ciao! Sono Mara. Come posso aiutarti?", "quickModules": "Quali moduli ha la piattaforma?", "quickRecommend": "Un consiglio per me", "quickHow": "Come funziona?", "errorMsg": "Si è verificato un errore.", "issueMsg": "C'è stato un problema.", "thinking": "In elaborazione...", "modules": "📚 Moduli", "recommendations": "🎯 Consigli", "help": "❓ Aiuto", "selectLanguage": "Seleziona lingua", "typing": "Mara sta scrivendo...", "chatError": "Errore di connessione.", "loginRequired": "Accedi per chattare con Mara...", "loginCta": "Accedi / Crea account"},
    "languageSelector": {"label": "Lingua", "changeLanguage": "Cambia lingua"},
})

OVERRIDES["pl"] = _base(
    common={"close": "Zamknij", "save": "Zapisz", "cancel": "Anuluj", "delete": "Usuń", "edit": "Edytuj", "loading": "Ładowanie...", "error": "Błąd", "success": "Sukces", "submit": "Wyślij", "back": "Wstecz", "next": "Dalej", "search": "Szukaj", "noResults": "Brak wyników", "retry": "Spróbuj ponownie", "confirm": "Potwierdź", "yes": "Tak", "no": "Nie", "or": "LUB", "all": "Wszystkie"},
    nav={"home": "Strona główna", "reels": "Reelsy", "trading": "Trading", "vip": "VIP", "creator": "Twórca", "writers": "Pisarze", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Misje", "pricing": "Cennik", "community": "Społeczność"},
    auth_login="Zaloguj się", auth_pw="Hasło", auth_name="Twoje imię",
    logout_lbl="Wyloguj się", settings_lbl="⚙️ Ustawienia",
    free_lbl="Bezpłatnie", per_month="/miesiąc", badge_pop="Najpopularniejszy",
    start_free="Zacznij za darmo", missions_lbl="Misje", day_lbl="dzień", days_lbl="dni",
)
OVERRIDES["pl"].update({
    "chat": {"title": "Czat z Mara", "placeholder": "Napisz wiadomość...", "send": "Wyślij", "welcome": "👋 Cześć {{name}}! Jestem Mara, twój inteligentny asystent.", "welcomeGuest": "👋 Cześć! Jestem Mara.", "quickModules": "Jakie moduły ma platforma?", "quickRecommend": "Rekomendacja dla mnie", "quickHow": "Jak to działa?", "errorMsg": "Wystąpił błąd.", "issueMsg": "Wystąpił problem.", "thinking": "Myślę...", "modules": "📚 Moduły", "recommendations": "🎯 Rekomendacje", "help": "❓ Pomoc", "selectLanguage": "Wybierz język", "typing": "Mara pisze...", "chatError": "Błąd połączenia.", "loginRequired": "Zaloguj się, aby rozmawiać z Mara...", "loginCta": "Zaloguj / Utwórz konto"},
    "languageSelector": {"label": "Język", "changeLanguage": "Zmień język"},
})

OVERRIDES["nl"] = _base(
    common={"close": "Sluiten", "save": "Opslaan", "cancel": "Annuleren", "delete": "Verwijderen", "edit": "Bewerken", "loading": "Laden...", "error": "Fout", "success": "Succes", "submit": "Verzenden", "back": "Terug", "next": "Volgende", "search": "Zoeken", "noResults": "Geen resultaten", "retry": "Opnieuw proberen", "confirm": "Bevestigen", "yes": "Ja", "no": "Nee", "or": "OF", "all": "Alle"},
    nav={"home": "Thuis", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Creator", "writers": "Schrijvers", "profile": "Profiel", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Missies", "pricing": "Prijzen", "community": "Gemeenschap"},
    auth_login="Inloggen", auth_pw="Wachtwoord", auth_name="Jouw naam",
    logout_lbl="Uitloggen", settings_lbl="⚙️ Instellingen",
    free_lbl="Gratis", per_month="/maand", badge_pop="Meest populair",
    start_free="Gratis beginnen", missions_lbl="Missies", day_lbl="dag", days_lbl="dagen",
)
OVERRIDES["nl"].update({
    "chat": {"title": "Chat met Mara", "placeholder": "Schrijf een bericht...", "send": "Verzenden", "welcome": "👋 Hoi {{name}}! Ik ben Mara, jouw slimme assistent.", "welcomeGuest": "👋 Hoi! Ik ben Mara.", "quickModules": "Welke modules heeft het platform?", "quickRecommend": "Aanbeveling voor mij", "quickHow": "Hoe werkt het?", "errorMsg": "Er is een fout opgetreden.", "issueMsg": "Er is een probleem.", "thinking": "Denken...", "modules": "📚 Modules", "recommendations": "🎯 Aanbevelingen", "help": "❓ Hulp", "selectLanguage": "Taal selecteren", "typing": "Mara typt...", "chatError": "Verbindingsfout.", "loginRequired": "Log in om te chatten met Mara...", "loginCta": "Inloggen / Account aanmaken"},
    "languageSelector": {"label": "Taal", "changeLanguage": "Taal wijzigen"},
})

OVERRIDES["cs"] = _base(
    common={"close": "Zavřít", "save": "Uložit", "cancel": "Zrušit", "delete": "Smazat", "edit": "Upravit", "loading": "Načítání...", "error": "Chyba", "success": "Úspěch", "submit": "Odeslat", "back": "Zpět", "next": "Další", "search": "Hledat", "noResults": "Žádné výsledky", "retry": "Zkusit znovu", "confirm": "Potvrdit", "yes": "Ano", "no": "Ne", "or": "NEBO", "all": "Vše"},
    nav={"home": "Domů", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Tvůrce", "writers": "Autoři", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Mise", "pricing": "Ceny", "community": "Komunita"},
    auth_login="Přihlásit se", auth_pw="Heslo", auth_name="Tvoje jméno",
    logout_lbl="Odhlásit se", settings_lbl="⚙️ Nastavení",
    free_lbl="Zdarma", per_month="/měsíc", badge_pop="Nejoblíbenější",
    start_free="Začít zdarma", missions_lbl="Mise", day_lbl="den", days_lbl="dní",
)
OVERRIDES["cs"].update({"chat": {"title": "Chat s Mara", "placeholder": "Napište zprávu...", "send": "Odeslat", "welcome": "👋 Ahoj {{name}}! Jsem Mara, tvůj chytrý asistent.", "welcomeGuest": "👋 Ahoj! Jsem Mara.", "thinking": "Přemýšlím...", "errorMsg": "Nastala chyba.", "issueMsg": "Nastal problém.", "quickModules": "Jaké moduly platforma má?", "quickRecommend": "Doporučení pro mě", "quickHow": "Jak to funguje?", "modules": "📚 Moduly", "recommendations": "🎯 Doporučení", "help": "❓ Pomoc", "selectLanguage": "Vybrat jazyk", "typing": "Mara píše...", "chatError": "Chyba připojení.", "loginRequired": "Přihlaste se pro chat s Mara...", "loginCta": "Přihlásit / Vytvořit účet"}, "languageSelector": {"label": "Jazyk", "changeLanguage": "Změnit jazyk"}})

OVERRIDES["hu"] = _base(
    common={"close": "Bezárás", "save": "Mentés", "cancel": "Mégse", "delete": "Törlés", "edit": "Szerkesztés", "loading": "Betöltés...", "error": "Hiba", "success": "Siker", "submit": "Küldés", "back": "Vissza", "next": "Tovább", "search": "Keresés", "noResults": "Nincs találat", "retry": "Újra", "confirm": "Megerősítés", "yes": "Igen", "no": "Nem", "or": "VAGY", "all": "Mind"},
    nav={"home": "Főoldal", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Alkotó", "writers": "Írók", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menü", "missions": "Küldetések", "pricing": "Árak", "community": "Közösség"},
    auth_login="Bejelentkezés", auth_pw="Jelszó", auth_name="A neved",
    logout_lbl="Kijelentkezés", settings_lbl="⚙️ Beállítások",
    free_lbl="Ingyenes", per_month="/hó", badge_pop="Legnépszerűbb",
    start_free="Ingyenes kezdés", missions_lbl="Küldetések", day_lbl="nap", days_lbl="nap",
)
OVERRIDES["hu"].update({"chat": {"title": "Chat Mara-val", "placeholder": "Írj üzenetet...", "send": "Küldés", "welcome": "👋 Szia {{name}}! Mara vagyok, az intelligens asszisztensed.", "welcomeGuest": "👋 Szia! Mara vagyok.", "thinking": "Gondolkozom...", "errorMsg": "Hiba történt.", "issueMsg": "Probléma lépett fel.", "quickModules": "Milyen moduljai vannak a platformnak?", "quickRecommend": "Javaslat számomra", "quickHow": "Hogyan működik?", "modules": "📚 Modulok", "recommendations": "🎯 Javaslatok", "help": "❓ Segítség", "selectLanguage": "Nyelv kiválasztása", "typing": "Mara gépel...", "chatError": "Kapcsolati hiba.", "loginRequired": "Jelentkezz be, hogy chatelj Marával...", "loginCta": "Bejelentkezés / Fiók létrehozása"}, "languageSelector": {"label": "Nyelv", "changeLanguage": "Nyelv módosítása"}})

OVERRIDES["bg"] = _base(
    common={"close": "Затвори", "save": "Запази", "cancel": "Отказ", "delete": "Изтрий", "edit": "Редактирай", "loading": "Зарежда...", "error": "Грешка", "success": "Успех", "submit": "Изпрати", "back": "Назад", "next": "Напред", "search": "Търси", "noResults": "Няма резултати", "retry": "Опитай пак", "confirm": "Потвърди", "yes": "Да", "no": "Не", "or": "ИЛИ", "all": "Всички"},
    nav={"home": "Начало", "reels": "Reels", "trading": "Трейдинг", "vip": "VIP", "creator": "Творец", "writers": "Писатели", "profile": "Профил", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Меню", "missions": "Мисии", "pricing": "Цени", "community": "Общност"},
    auth_login="Влез", auth_pw="Парола", auth_name="Твоето име",
    logout_lbl="Изход", settings_lbl="⚙️ Настройки",
    free_lbl="Безплатно", per_month="/месец", badge_pop="Най-популярен",
    start_free="Започни безплатно", missions_lbl="Мисии", day_lbl="ден", days_lbl="дни",
)
OVERRIDES["bg"].update({"chat": {"title": "Чат с Mara", "placeholder": "Напиши съобщение...", "send": "Изпрати", "welcome": "👋 Здравей {{name}}! Аз съм Мара, твоят умен асистент.", "welcomeGuest": "👋 Здравей! Аз съм Мара.", "thinking": "Мисля...", "errorMsg": "Възникна грешка.", "issueMsg": "Имаше проблем.", "quickModules": "Какви модули има платформата?", "quickRecommend": "Препоръка за мен", "quickHow": "Как работи?", "modules": "📚 Модули", "recommendations": "🎯 Препоръки", "help": "❓ Помощ", "selectLanguage": "Избери език", "typing": "Мара пише...", "chatError": "Грешка при свързване.", "loginRequired": "Влез за чат с Мара...", "loginCta": "Вход / Създай акаунт"}, "languageSelector": {"label": "Език", "changeLanguage": "Смени език"}})

OVERRIDES["hr"] = _base(
    common={"close": "Zatvori", "save": "Spremi", "cancel": "Odustani", "delete": "Obriši", "edit": "Uredi", "loading": "Učitavanje...", "error": "Greška", "success": "Uspjeh", "submit": "Pošalji", "back": "Natrag", "next": "Dalje", "search": "Traži", "noResults": "Nema rezultata", "retry": "Pokušaj ponovo", "confirm": "Potvrdi", "yes": "Da", "no": "Ne", "or": "ILI", "all": "Sve"},
    nav={"home": "Početna", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Kreator", "writers": "Pisci", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Izbornik", "missions": "Misije", "pricing": "Cijene", "community": "Zajednica"},
    auth_login="Prijavi se", auth_pw="Lozinka", auth_name="Tvoje ime",
    logout_lbl="Odjava", settings_lbl="⚙️ Postavke",
    free_lbl="Besplatno", per_month="/mj.", badge_pop="Najpopularnije",
    start_free="Počni besplatno", missions_lbl="Misije", day_lbl="dan", days_lbl="dana",
)
OVERRIDES["hr"].update({"chat": {"title": "Chat s Marom", "placeholder": "Piši poruku...", "send": "Pošalji", "welcome": "👋 Bok {{name}}! Ja sam Mara, tvoj pametni asistent.", "welcomeGuest": "👋 Bok! Ja sam Mara.", "thinking": "Razmišljam...", "errorMsg": "Došlo je do greške.", "issueMsg": "Nastao je problem.", "quickModules": "Koji moduli platforma ima?", "quickRecommend": "Preporuka za mene", "quickHow": "Kako radi?", "modules": "📚 Moduli", "recommendations": "🎯 Preporuke", "help": "❓ Pomoć", "selectLanguage": "Odaberi jezik", "typing": "Mara piše...", "chatError": "Greška veze.", "loginRequired": "Prijavi se za chat s Marom...", "loginCta": "Prijava / Stvori račun"}, "languageSelector": {"label": "Jezik", "changeLanguage": "Promijeni jezik"}})

OVERRIDES["sr"] = _base(
    common={"close": "Затвори", "save": "Сачувај", "cancel": "Откажи", "delete": "Обриши", "edit": "Уреди", "loading": "Учитавање...", "error": "Грешка", "success": "Успех", "submit": "Пошаљи", "back": "Назад", "next": "Даље", "search": "Претражи", "noResults": "Нема резултата", "retry": "Покушај поново", "confirm": "Потврди", "yes": "Да", "no": "Не", "or": "ИЛИ", "all": "Све"},
    nav={"home": "Почетна", "reels": "Reels", "trading": "Трговање", "vip": "VIP", "creator": "Творац", "writers": "Писци", "profile": "Профил", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Мени", "missions": "Мисије", "pricing": "Цене", "community": "Заједница"},
    auth_login="Пријави се", auth_pw="Лозинка", auth_name="Твоје ime",
    logout_lbl="Одјава", settings_lbl="⚙️ Подешавања",
    free_lbl="Бесплатно", per_month="/мес.", badge_pop="Најпопуларније",
    start_free="Почни бесплатно", missions_lbl="Мисије", day_lbl="дан", days_lbl="дана",
)
OVERRIDES["sr"].update({"chat": {"title": "Ћаскање са Маром", "placeholder": "Пиши поруку...", "send": "Пошаљи", "welcome": "👋 Здраво {{name}}! Ја сам Мара, твој паметни асистент.", "welcomeGuest": "👋 Здраво! Ја сам Мара.", "thinking": "Размишљам...", "errorMsg": "Дошло је до грешке.", "issueMsg": "Настао је проблем.", "quickModules": "Које модуле платформа има?", "quickRecommend": "Препорука за мене", "quickHow": "Како ради?", "modules": "📚 Модули", "recommendations": "🎯 Препоруке", "help": "❓ Помоћ", "selectLanguage": "Одабери језик", "typing": "Мара пише...", "chatError": "Грешка везе.", "loginRequired": "Пријави се за ћаскање са Маром...", "loginCta": "Пријава / Направи налог"}, "languageSelector": {"label": "Језик", "changeLanguage": "Промени језик"}})

OVERRIDES["tr"] = _base(
    common={"close": "Kapat", "save": "Kaydet", "cancel": "İptal", "delete": "Sil", "edit": "Düzenle", "loading": "Yükleniyor...", "error": "Hata", "success": "Başarılı", "submit": "Gönder", "back": "Geri", "next": "İleri", "search": "Ara", "noResults": "Sonuç yok", "retry": "Tekrar dene", "confirm": "Onayla", "yes": "Evet", "no": "Hayır", "or": "VEYA", "all": "Tümü"},
    nav={"home": "Ana Sayfa", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "İçerik Üretici", "writers": "Yazarlar", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menü", "missions": "Görevler", "pricing": "Fiyatlar", "community": "Topluluk"},
    auth_login="Giriş yap", auth_pw="Şifre", auth_name="Adın",
    logout_lbl="Çıkış yap", settings_lbl="⚙️ Ayarlar",
    free_lbl="Ücretsiz", per_month="/ay", badge_pop="En popüler",
    start_free="Ücretsiz başla", missions_lbl="Görevler", day_lbl="gün", days_lbl="gün",
)
OVERRIDES["tr"].update({"chat": {"title": "Mara ile Sohbet", "placeholder": "Mesaj yaz...", "send": "Gönder", "welcome": "👋 Merhaba {{name}}! Ben Mara, akıllı asistanın.", "welcomeGuest": "👋 Merhaba! Ben Mara.", "thinking": "Düşünüyorum...", "errorMsg": "Bir hata oluştu.", "issueMsg": "Bir sorun oluştu.", "quickModules": "Platformun hangi modülleri var?", "quickRecommend": "Benim için öneri", "quickHow": "Nasıl çalışır?", "modules": "📚 Modüller", "recommendations": "🎯 Öneriler", "help": "❓ Yardım", "selectLanguage": "Dil seç", "typing": "Mara yazıyor...", "chatError": "Bağlantı hatası.", "loginRequired": "Mara ile sohbet için giriş yap...", "loginCta": "Giriş / Hesap oluştur"}, "languageSelector": {"label": "Dil", "changeLanguage": "Dili değiştir"}})

OVERRIDES["ko"] = _base(
    common={"close": "닫기", "save": "저장", "cancel": "취소", "delete": "삭제", "edit": "편집", "loading": "로딩 중...", "error": "오류", "success": "성공", "submit": "제출", "back": "뒤로", "next": "다음", "search": "검색", "noResults": "결과 없음", "retry": "다시 시도", "confirm": "확인", "yes": "예", "no": "아니오", "or": "또는", "all": "전체"},
    nav={"home": "홈", "reels": "릴스", "trading": "트레이딩", "vip": "VIP", "creator": "크리에이터", "writers": "작가", "profile": "프로필", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "메뉴", "missions": "미션", "pricing": "요금제", "community": "커뮤니티"},
    auth_login="로그인", auth_pw="비밀번호", auth_name="이름",
    logout_lbl="로그아웃", settings_lbl="⚙️ 설정",
    free_lbl="무료", per_month="/월", badge_pop="가장 인기",
    start_free="무료로 시작", missions_lbl="미션", day_lbl="일", days_lbl="일",
)
OVERRIDES["ko"].update({"chat": {"title": "Mara와 채팅", "placeholder": "메시지를 입력하세요...", "send": "전송", "welcome": "👋 안녕하세요 {{name}}! 저는 Mara, 당신의 스마트 어시스턴트입니다.", "welcomeGuest": "👋 안녕하세요! 저는 Mara입니다.", "thinking": "생각 중...", "errorMsg": "오류가 발생했습니다.", "issueMsg": "문제가 발생했습니다.", "quickModules": "플랫폼에 어떤 모듈이 있나요?", "quickRecommend": "나를 위한 추천", "quickHow": "어떻게 작동하나요?", "modules": "📚 모듈", "recommendations": "🎯 추천", "help": "❓ 도움말", "selectLanguage": "언어 선택", "typing": "Mara가 입력 중...", "chatError": "연결 오류.", "loginRequired": "Mara와 채팅하려면 로그인하세요...", "loginCta": "로그인 / 계정 만들기"}, "languageSelector": {"label": "언어", "changeLanguage": "언어 변경"}})

OVERRIDES["zh"] = _base(
    common={"close": "关闭", "save": "保存", "cancel": "取消", "delete": "删除", "edit": "编辑", "loading": "加载中...", "error": "错误", "success": "成功", "submit": "提交", "back": "返回", "next": "下一步", "search": "搜索", "noResults": "无结果", "retry": "重试", "confirm": "确认", "yes": "是", "no": "否", "or": "或", "all": "全部"},
    nav={"home": "首页", "reels": "短视频", "trading": "交易", "vip": "VIP", "creator": "创作者", "writers": "写作者", "profile": "个人资料", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "菜单", "missions": "任务", "pricing": "价格", "community": "社区"},
    auth_login="登录", auth_pw="密码", auth_name="你的名字",
    logout_lbl="退出登录", settings_lbl="⚙️ 设置",
    free_lbl="免费", per_month="/月", badge_pop="最受欢迎",
    start_free="免费开始", missions_lbl="任务", day_lbl="天", days_lbl="天",
)
OVERRIDES["zh"].update({"chat": {"title": "与Mara对话", "placeholder": "输入消息...", "send": "发送", "welcome": "👋 你好 {{name}}！我是Mara，你的智能助理。", "welcomeGuest": "👋 你好！我是Mara。", "thinking": "思考中...", "errorMsg": "发生错误。", "issueMsg": "出现问题。", "quickModules": "平台有哪些模块？", "quickRecommend": "给我推荐", "quickHow": "如何使用？", "modules": "📚 模块", "recommendations": "🎯 推荐", "help": "❓ 帮助", "selectLanguage": "选择语言", "typing": "Mara正在输入...", "chatError": "连接错误。", "loginRequired": "登录后与Mara聊天...", "loginCta": "登录 / 创建账户"}, "languageSelector": {"label": "语言", "changeLanguage": "更改语言"}})

OVERRIDES["th"] = _base(
    common={"close": "ปิด", "save": "บันทึก", "cancel": "ยกเลิก", "delete": "ลบ", "edit": "แก้ไข", "loading": "กำลังโหลด...", "error": "ข้อผิดพลาด", "success": "สำเร็จ", "submit": "ส่ง", "back": "กลับ", "next": "ถัดไป", "search": "ค้นหา", "noResults": "ไม่พบผลลัพธ์", "retry": "ลองอีกครั้ง", "confirm": "ยืนยัน", "yes": "ใช่", "no": "ไม่", "or": "หรือ", "all": "ทั้งหมด"},
    nav={"home": "หน้าแรก", "reels": "รีลส์", "trading": "เทรดดิ้ง", "vip": "VIP", "creator": "ครีเอเตอร์", "writers": "นักเขียน", "profile": "โปรไฟล์", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "เมนู", "missions": "ภารกิจ", "pricing": "ราคา", "community": "ชุมชน"},
    auth_login="เข้าสู่ระบบ", auth_pw="รหัสผ่าน", auth_name="ชื่อของคุณ",
    logout_lbl="ออกจากระบบ", settings_lbl="⚙️ การตั้งค่า",
    free_lbl="ฟรี", per_month="/เดือน", badge_pop="ยอดนิยม",
    start_free="เริ่มฟรี", missions_lbl="ภารกิจ", day_lbl="วัน", days_lbl="วัน",
)
OVERRIDES["th"].update({"chat": {"title": "แชทกับ Mara", "placeholder": "พิมพ์ข้อความ...", "send": "ส่ง", "welcome": "👋 สวัสดี {{name}}! ฉันคือ Mara ผู้ช่วยอัจฉริยะของคุณ", "welcomeGuest": "👋 สวัสดี! ฉันคือ Mara", "thinking": "กำลังคิด...", "errorMsg": "เกิดข้อผิดพลาด", "issueMsg": "มีปัญหาเกิดขึ้น", "quickModules": "แพลตฟอร์มมีโมดูลอะไรบ้าง?", "quickRecommend": "แนะนำสำหรับฉัน", "quickHow": "ใช้งานอย่างไร?", "modules": "📚 โมดูล", "recommendations": "🎯 คำแนะนำ", "help": "❓ ช่วยเหลือ", "selectLanguage": "เลือกภาษา", "typing": "Mara กำลังพิมพ์...", "chatError": "ข้อผิดพลาดการเชื่อมต่อ", "loginRequired": "เข้าสู่ระบบเพื่อแชทกับ Mara...", "loginCta": "เข้าสู่ระบบ / สร้างบัญชี"}, "languageSelector": {"label": "ภาษา", "changeLanguage": "เปลี่ยนภาษา"}})

OVERRIDES["vi"] = _base(
    common={"close": "Đóng", "save": "Lưu", "cancel": "Hủy", "delete": "Xóa", "edit": "Sửa", "loading": "Đang tải...", "error": "Lỗi", "success": "Thành công", "submit": "Gửi", "back": "Quay lại", "next": "Tiếp", "search": "Tìm kiếm", "noResults": "Không tìm thấy", "retry": "Thử lại", "confirm": "Xác nhận", "yes": "Có", "no": "Không", "or": "HOẶC", "all": "Tất cả"},
    nav={"home": "Trang chủ", "reels": "Reels", "trading": "Giao dịch", "vip": "VIP", "creator": "Nhà sáng tạo", "writers": "Nhà văn", "profile": "Hồ sơ", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Nhiệm vụ", "pricing": "Bảng giá", "community": "Cộng đồng"},
    auth_login="Đăng nhập", auth_pw="Mật khẩu", auth_name="Tên của bạn",
    logout_lbl="Đăng xuất", settings_lbl="⚙️ Cài đặt",
    free_lbl="Miễn phí", per_month="/tháng", badge_pop="Phổ biến nhất",
    start_free="Bắt đầu miễn phí", missions_lbl="Nhiệm vụ", day_lbl="ngày", days_lbl="ngày",
)
OVERRIDES["vi"].update({"chat": {"title": "Trò chuyện với Mara", "placeholder": "Nhập tin nhắn...", "send": "Gửi", "welcome": "👋 Xin chào {{name}}! Tôi là Mara, trợ lý thông minh của bạn.", "welcomeGuest": "👋 Xin chào! Tôi là Mara.", "thinking": "Đang suy nghĩ...", "errorMsg": "Đã xảy ra lỗi.", "issueMsg": "Có vấn đề xảy ra.", "quickModules": "Nền tảng có những module nào?", "quickRecommend": "Gợi ý cho tôi", "quickHow": "Hoạt động như thế nào?", "modules": "📚 Module", "recommendations": "🎯 Gợi ý", "help": "❓ Trợ giúp", "selectLanguage": "Chọn ngôn ngữ", "typing": "Mara đang gõ...", "chatError": "Lỗi kết nối.", "loginRequired": "Đăng nhập để trò chuyện với Mara...", "loginCta": "Đăng nhập / Tạo tài khoản"}, "languageSelector": {"label": "Ngôn ngữ", "changeLanguage": "Đổi ngôn ngữ"}})

OVERRIDES["sv"] = _base(
    common={"close": "Stäng", "save": "Spara", "cancel": "Avbryt", "delete": "Radera", "edit": "Redigera", "loading": "Laddar...", "error": "Fel", "success": "Lyckat", "submit": "Skicka", "back": "Tillbaka", "next": "Nästa", "search": "Sök", "noResults": "Inga resultat", "retry": "Försök igen", "confirm": "Bekräfta", "yes": "Ja", "no": "Nej", "or": "ELLER", "all": "Alla"},
    nav={"home": "Hem", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Skapare", "writers": "Författare", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Meny", "missions": "Uppdrag", "pricing": "Priser", "community": "Gemenskap"},
    auth_login="Logga in", auth_pw="Lösenord", auth_name="Ditt namn",
    logout_lbl="Logga ut", settings_lbl="⚙️ Inställningar",
    free_lbl="Gratis", per_month="/månad", badge_pop="Mest populär",
    start_free="Börja gratis", missions_lbl="Uppdrag", day_lbl="dag", days_lbl="dagar",
)
OVERRIDES["sv"].update({"chat": {"title": "Chatta med Mara", "placeholder": "Skriv ett meddelande...", "send": "Skicka", "welcome": "👋 Hej {{name}}! Jag är Mara, din smarta assistent.", "welcomeGuest": "👋 Hej! Jag är Mara.", "thinking": "Tänker...", "errorMsg": "Ett fel uppstod.", "issueMsg": "Det uppstod ett problem.", "quickModules": "Vilka moduler har plattformen?", "quickRecommend": "Rekommendation för mig", "quickHow": "Hur fungerar det?", "modules": "📚 Moduler", "recommendations": "🎯 Rekommendationer", "help": "❓ Hjälp", "selectLanguage": "Välj språk", "typing": "Mara skriver...", "chatError": "Anslutningsfel.", "loginRequired": "Logga in för att chatta med Mara...", "loginCta": "Logga in / Skapa konto"}, "languageSelector": {"label": "Språk", "changeLanguage": "Ändra språk"}})

OVERRIDES["da"] = _base(
    common={"close": "Luk", "save": "Gem", "cancel": "Annullér", "delete": "Slet", "edit": "Rediger", "loading": "Indlæser...", "error": "Fejl", "success": "Succes", "submit": "Send", "back": "Tilbage", "next": "Næste", "search": "Søg", "noResults": "Ingen resultater", "retry": "Prøv igen", "confirm": "Bekræft", "yes": "Ja", "no": "Nej", "or": "ELLER", "all": "Alle"},
    nav={"home": "Hjem", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Skaber", "writers": "Forfattere", "profile": "Profil", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Menu", "missions": "Missioner", "pricing": "Priser", "community": "Fællesskab"},
    auth_login="Log ind", auth_pw="Adgangskode", auth_name="Dit navn",
    logout_lbl="Log ud", settings_lbl="⚙️ Indstillinger",
    free_lbl="Gratis", per_month="/måned", badge_pop="Mest populær",
    start_free="Start gratis", missions_lbl="Missioner", day_lbl="dag", days_lbl="dage",
)
OVERRIDES["da"].update({"chat": {"title": "Chat med Mara", "placeholder": "Skriv en besked...", "send": "Send", "welcome": "👋 Hej {{name}}! Jeg er Mara, din smarte assistent.", "welcomeGuest": "👋 Hej! Jeg er Mara.", "thinking": "Tænker...", "errorMsg": "Der opstod en fejl.", "issueMsg": "Der opstod et problem.", "quickModules": "Hvilke moduler har platformen?", "quickRecommend": "Anbefaling til mig", "quickHow": "Hvordan virker det?", "modules": "📚 Moduler", "recommendations": "🎯 Anbefalinger", "help": "❓ Hjælp", "selectLanguage": "Vælg sprog", "typing": "Mara skriver...", "chatError": "Forbindelsesfejl.", "loginRequired": "Log ind for at chatte med Mara...", "loginCta": "Log ind / Opret konto"}, "languageSelector": {"label": "Sprog", "changeLanguage": "Skift sprog"}})

OVERRIDES["el"] = _base(
    common={"close": "Κλείσιμο", "save": "Αποθήκευση", "cancel": "Ακύρωση", "delete": "Διαγραφή", "edit": "Επεξεργασία", "loading": "Φόρτωση...", "error": "Σφάλμα", "success": "Επιτυχία", "submit": "Υποβολή", "back": "Πίσω", "next": "Επόμενο", "search": "Αναζήτηση", "noResults": "Δεν βρέθηκαν αποτελέσματα", "retry": "Δοκιμή ξανά", "confirm": "Επιβεβαίωση", "yes": "Ναι", "no": "Όχι", "or": "Ή", "all": "Όλα"},
    nav={"home": "Αρχική", "reels": "Reels", "trading": "Trading", "vip": "VIP", "creator": "Δημιουργός", "writers": "Συγγραφείς", "profile": "Προφίλ", "brand": "MARAAI", "brandMobile": "MARA", "toggleMenu": "Μενού", "missions": "Αποστολές", "pricing": "Τιμές", "community": "Κοινότητα"},
    auth_login="Σύνδεση", auth_pw="Κωδικός", auth_name="Το όνομά σου",
    logout_lbl="Αποσύνδεση", settings_lbl="⚙️ Ρυθμίσεις",
    free_lbl="Δωρεάν", per_month="/μήνα", badge_pop="Πιο δημοφιλές",
    start_free="Ξεκίνα δωρεάν", missions_lbl="Αποστολές", day_lbl="ημέρα", days_lbl="ημέρες",
)
OVERRIDES["el"].update({"chat": {"title": "Συνομιλία με την Mara", "placeholder": "Γράψε μήνυμα...", "send": "Αποστολή", "welcome": "👋 Γεια σου {{name}}! Είμαι η Mara, ο έξυπνος βοηθός σου.", "welcomeGuest": "👋 Γεια σου! Είμαι η Mara.", "thinking": "Σκέφτομαι...", "errorMsg": "Παρουσιάστηκε σφάλμα.", "issueMsg": "Υπήρξε πρόβλημα.", "quickModules": "Τι modules έχει η πλατφόρμα;", "quickRecommend": "Σύσταση για μένα", "quickHow": "Πώς λειτουργεί;", "modules": "📚 Modules", "recommendations": "🎯 Συστάσεις", "help": "❓ Βοήθεια", "selectLanguage": "Επιλογή γλώσσας", "typing": "Η Mara πληκτρολογεί...", "chatError": "Σφάλμα σύνδεσης.", "loginRequired": "Συνδέσου για να μιλήσεις με την Mara...", "loginCta": "Σύνδεση / Δημιουργία λογαριασμού"}, "languageSelector": {"label": "Γλώσσα", "changeLanguage": "Αλλαγή γλώσσας"}})

# Also fix nav.missions and home.missions for comprehensive RO (these fell back to EN)
OVERRIDES["ro"].setdefault("nav", {})["missions"] = "Misiuni"
OVERRIDES["ro"].setdefault("nav", {})["pricing"] = "Prețuri"
OVERRIDES["ro"].setdefault("nav", {})["community"] = "Comunitate"
OVERRIDES["ro"].setdefault("home", {})["missions"] = "Misiuni"
OVERRIDES["ro"].setdefault("home", {})["programs"] = "Programe"
OVERRIDES["ro"].setdefault("home", {})["mobileAriaLabel"] = "Selector mobil Mara AI"
OVERRIDES["ro"].setdefault("home", {})["subsystemSettings"] = "Setări subsisteme"
OVERRIDES["ro"].setdefault("home", {})["createAccount"] = "Creează cont"

'''

MARKER = "# ---------------------------------------------------------------------------\n# Auth error-code translations."
assert MARKER in text, "Marker not found!"
text = text.replace(MARKER, INSERTION + MARKER, 1)
SRC.write_text(text, encoding="utf-8")
print("patch_langs.py inserted successfully")
