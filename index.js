const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = 7533630775;
const RO_API_KEY = process.env.RO_API_KEY;
const RO_BASE_URL = 'https://www.rumahotp.io/api';

// --- DATABASE SCHEMA ---
mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, unique: true },
    username: String,
    firstName: String,
    saldo: { type: Number, default: 0 },
    role: { type: String, default: 'Member' },
    isBanned: { type: Boolean, default: false }
}));

const roApi = axios.create({
    baseURL: RO_BASE_URL,
    headers: { 'x-apikey': RO_API_KEY, 'Accept': 'application/json' }
});

// --- HELPER ---
const formatIDR = (val) => `Rp ${val.toLocaleString('id-ID')}`;

// --- MENU BUTTONS ---
const mainKeyboard = (isAdmin) => {
    const btns = [
        [Markup.button.callback('🛍️ Beli Nokos', 'list_services'), Markup.button.callback('💰 Isi Saldo', 'deposit')],
        [Markup.button.callback('👤 Profil', 'profile'), Markup.button.callback('🆘 Bantuan', 'support')]
    ];
    if (isAdmin) btns.push([Markup.button.callback('🛠️ Panel Owner', 'owner_panel')]);
    return Markup.inlineKeyboard(btns);
};

// --- LOGIKA UTAMA ---

bot.start(async (ctx) => {
    try {
        const isOwner = ctx.from.id === OWNER_ID;
        let user = await User.findOneAndUpdate(
            { telegramId: ctx.from.id },
            { username: ctx.from.username, firstName: ctx.from.first_name },
            { upsert: true, new: true }
        );

        const caption = `👋 *Halo ${ctx.from.first_name}!*\nSelamat datang di *Manzzy ID*.\n\n💰 Saldo: *${formatIDR(user.saldo)}*`;

        // Gunakan TRY CATCH khusus untuk foto
        try {
            await ctx.replyWithPhoto('https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1775385903372_357.jpg', {
                caption: caption,
                parse_mode: 'Markdown',
                ...mainKeyboard(isOwner)
            });
        } catch (photoError) {
            // Kalau foto gagal, kirim teks aja biar bot nggak mati
            await ctx.reply(caption, {
                parse_mode: 'Markdown',
                ...mainKeyboard(isOwner)
            });
        }
    } catch (err) {
        console.error("ERROR START:", err);
    }
});
// --- FITUR OWNER (ADD SALDO) ---
// Perintah: /addsaldo [ID] [Jumlah]
bot.command('addsaldo', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Format: /addsaldo [ID] [Jumlah]');

    const targetId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    const updated = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { saldo: amount } }, { new: true });
    if (updated) {
        ctx.reply(`✅ Berhasil! Saldo ${updated.firstName} bertambah. Total: ${formatIDR(updated.saldo)}`);
        bot.telegram.sendMessage(targetId, `💰 Saldo Anda telah ditambahkan sebesar *${formatIDR(amount)}* oleh Admin!`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('❌ User tidak ditemukan di database.');
    }
});

// --- PANEL OWNER (CEK SALDO PUSAT) ---
bot.action('owner_panel', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('Akses Ditolak!');
    try {
        const res = await roApi.get('/v1/user/balance');
        const bal = res.data.data;
        await ctx.editMessageCaption(`👑 *OWNER PANEL - Manzzy ID*\n\n💰 Saldo Pusat (RO): *${bal.formated}*\n📧 Email RO: ${bal.email}\n\n*Fitur Cepat:* \n/addsaldo [ID] [Jumlah]\n/ban [ID]`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'start_menu')]])
        });
    } catch (e) { ctx.reply('Gagal cek saldo pusat.'); }
});

// --- SISTEM BANTUAN (BOT CHAT) ---
bot.action('support', async (ctx) => {
    await ctx.editMessageCaption('📝 *Sistem Tiket Bantuan*\n\nSilakan ketik pesan/kendala Anda di sini. Pesan Anda akan langsung terkirim ke Owner.', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'start_menu')]])
    });
    // Set session atau state user sedang mode bertanya (bisa pakai session middleware, tapi ini cara simpelnya)
    return ctx.answerCbQuery();
});

// Menangani pesan teks yang bukan perintah (Untuk Chat Support)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // Abaikan perintah

    // Jika Owner membalas pesan terusan (Reply pesan dari bot)
    if (ctx.from.id === OWNER_ID && ctx.message.reply_to_message) {
        const originalMsg = ctx.message.reply_to_message.text;
        const targetUserId = originalMsg.match(/User ID: (\d+)/)?.[1];
        
        if (targetUserId) {
            await bot.telegram.sendMessage(targetUserId, `💬 *Balasan dari Owner:*\n\n${ctx.message.text}`, { parse_mode: 'Markdown' });
            return ctx.reply('✅ Balasan terkirim ke user.');
        }
    }

    // Jika User mengirim pesan ke Bot (Support)
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('🚀 Pesan Anda telah terkirim ke Owner. Tunggu balasan ya!');
        await bot.telegram.sendMessage(OWNER_ID, `📩 *PESAN BANTUAN BARU*\n\nDari: ${ctx.from.first_name} (@${ctx.from.username})\nUser ID: ${ctx.from.id}\n\nPesan:\n${ctx.message.text}`, { parse_mode: 'Markdown' });
    }
});

// Menu Kembali
bot.action('start_menu', async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await ctx.editMessageCaption(`👋 *Main Menu Manzzy ID*\n\n💰 Saldo: *${formatIDR(user.saldo)}*`, {
        parse_mode: 'Markdown',
        ...mainKeyboard(isOwner)
    });
});


// --- HELPER PAGINATION ---
const createPagination = (data, prefix, currentPage = 0, itemsPerPage = 8) => {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const items = data.slice(start, end);

    const buttons = items.map(item => [
        Markup.button.callback(item.text, `${prefix}_${item.id}`)
    ]);

    const navRow = [];
    if (currentPage > 0) navRow.push(Markup.button.callback('⬅️ Prev', `${prefix}page_${currentPage - 1}`));
    if (currentPage < totalPages - 1) navRow.push(Markup.button.callback('Next ➡️', `${prefix}page_${currentPage + 1}`));
    
    if (navRow.length > 0) buttons.push(navRow);
    buttons.push([Markup.button.callback('🏠 Menu Utama', 'start_menu')]);
    
    return Markup.inlineKeyboard(buttons);
};

// --- 1. LIST SERVICES DENGAN HALAMAN ---
bot.action(/^(list_services|svcpage_(.+))$/, async (ctx) => {
    try {
        const page = ctx.match[2] ? parseInt(ctx.match[2]) : 0;
        await ctx.answerCbQuery();
        
        const res = await roApi.get('/v2/services');
        const services = res.data.data.map(s => ({ text: s.service_name, id: s.service_code }));

        await ctx.editMessageCaption('📱 *Pilih Layanan (Hal ' + (page + 1) + '):*', {
            parse_mode: 'Markdown',
            ...createPagination(services, 'svc', page)
        });
    } catch (e) { ctx.reply('❌ Gagal ambil layanan.'); }
});

// --- HELPER UNTUK MEMBUAT TOMBOL GRID ---
const createGrid = (data, prefix, page = 0, columns = 2, rows = 8) => {
    const itemsPerPage = columns * rows;
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const start = page * itemsPerPage;
    const items = data.slice(start, start + itemsPerPage);

    const keyboard = [];
    for (let i = 0; i < items.length; i += columns) {
        keyboard.push(items.slice(i, i + columns).map(item => 
            Markup.button.callback(item.text, `${prefix}_${item.id}`)
        ));
    }

    // Navigasi
    const navRow = [];
    if (page > 0) navRow.push(Markup.button.callback('⬅️ Sebelumnya', `${prefix}pg_${page - 1}`));
    if (page < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya ➡️', `${prefix}pg_${page + 1}`));
    if (navRow.length > 0) keyboard.push(navRow);

    keyboard.push([Markup.button.callback('🔙 Kembali', 'list_services'), Markup.button.callback('🏠 Menu', 'start_menu')]);
    
    return { keyboard, totalPages, totalItems: data.length };
};

// --- STEP 2: PILIH NEGARA (PASTIKAN SERVICE ID TERIKUT) ---
bot.action(/^(svc_(.+)|svcpg_(.+)_(.+))$/, async (ctx) => {
    const serviceId = ctx.match[2] || ctx.match[3];
    const page = ctx.match[4] ? parseInt(ctx.match[4]) : 0;

    try {
        await ctx.answerCbQuery('Memuat Negara...');
        const res = await roApi.get(`/v2/countries?service_id=${serviceId}`);
        
        // Cek apakah data ada
        if (!res.data || !res.data.data) return ctx.reply('❌ Gagal mengambil data dari pusat.');

        const countries = res.data.data.map(c => ({
            text: `🌍 ${c.name}`,
            // Kirim: spg_[serviceId]_[numberId]
            id: `${serviceId}_${c.number_id}`
        }));

        // Buat Grid 2 Kolom
        const grid = [];
        const start = page * 16; // 8 baris x 2 kolom
        const pagedData = countries.slice(start, start + 16);

        for (let i = 0; i < pagedData.length; i += 2) {
            grid.push(pagedData.slice(i, i + 2).map(c => 
                Markup.button.callback(c.text, `spg_${c.id}`)
            ));
        }

        // Navigasi
        const nav = [];
        if (page > 0) nav.push(Markup.button.callback('⬅️ Prev', `svcpg_${serviceId}_${page - 1}`));
        if (start + 16 < countries.length) nav.push(Markup.button.callback('Next ➡️', `svcpg_${serviceId}_${page + 1}`));
        if (nav.length > 0) grid.push(nav);
        grid.push([Markup.button.callback('🏠 Menu', 'start_menu')]);

        await ctx.editMessageCaption(`🌍 *PILIH NEGARA*\nLayanan ID: ${serviceId}\nHalaman: ${page + 1}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(grid)
        });
    } catch (e) { ctx.reply('❌ Gagal memuat negara.'); }
});

// --- STEP 3: PILIH SERVER (FIXED FIND ERROR) ---
bot.action(/^spg_(.+)_(.+)$/, async (ctx) => {
    const svcId = ctx.match[1]; // ID Aplikasi
    const numId = ctx.match[2]; // ID Negara

    try {
        await ctx.answerCbQuery('Memuat Server...');

        const res = await roApi.get(`/v2/countries?service_id=${svcId}`);
        
        // Validasi data API sebelum .find()
        if (!res.data || !res.data.data) {
            throw new Error("Data API Kosong");
        }

        const country = res.data.data.find(c => String(c.number_id) === String(numId));
        
        if (!country || !country.pricelist) {
            return ctx.reply('❌ Server tidak tersedia untuk negara ini.');
        }

        // Buat Grid Server (S1, S2, dst) 3 Kolom
        const serverButtons = [];
        const list = country.pricelist;

        for (let i = 0; i < list.length; i += 3) {
            const row = list.slice(i, i + 3).map((p, idx) => {
                return Markup.button.callback(`🖥️ S${i + idx + 1}`, `opr_${numId}_${p.provider_id}_${p.price}_${country.iso_code}`);
            });
            serverButtons.push(row);
        }

        serverButtons.push([Markup.button.callback('⬅️ Kembali', `svc_${svcId}`)]);

        const caption = `*${country.prefix} PILIH SERVER - ${country.name.toUpperCase()}*\n\n` +
                        `Layanan: WhatsApp\n` +
                        `Stok: ${country.stock_total} nomor\n` +
                        `Server: ${list.length} tersedia\n\n` +
                        `📋 *DAFTAR SERVER TERSEDIA*`;

        await ctx.editMessageCaption(caption, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(serverButtons)
        });

    } catch (e) {
        console.error("ERROR STEP 3:", e.message);
        ctx.reply('❌ Gagal memuat server. Coba klik ulang negara.');
    }
});
// --- 4. STEP: PILIH OPERATOR ---
bot.action(/^opr_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, price, iso] = ctx.match;
    
    try {
        await ctx.answerCbQuery('Memuat Operator...');
        const res = await roApi.get(`/v2/operators?country=${iso}&provider_id=${provId}`);
        
        let ops = res.data.data || [];
        if (ops.length === 0) ops = [{ id: 'any', name: 'Otomatis (Any)' }];

        const buttons = ops.map(op => [
            // SINKRON: Pakai 'cf_' agar cocok dengan Step 5
            Markup.button.callback(`📶 Op: ${op.name}`, `cf_${numId}_${provId}_${op.id}_${price}`)
        ]);

        buttons.push([Markup.button.callback('⬅️ Ganti Harga/Server', `srv_13_${numId}`)]);

        await ctx.editMessageCaption(`⚡ *Pilih Operator:*\nNegara: ${iso.toUpperCase()} | Harga: Rp ${parseInt(price).toLocaleString('id-ID')}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) { 
        ctx.reply('❌ Gagal memuat operator.'); 
    }
});

// --- 5. STEP: KONFIRMASI ---
bot.action(/^cf_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, opId, price] = ctx.match;

    const msg = `🛒 *KONFIRMASI PESANAN*\n━━━━━━━━━━━━━━━━━━\n` +
                `📶 Operator: *${opId.toUpperCase()}*\n` +
                `💰 Biaya: *Rp ${parseInt(price).toLocaleString('id-ID')}*\n━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ _Saldo Manzzy ID Anda akan langsung terpotong._`;

    await ctx.editMessageCaption(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ BELI SEKARANG', `buy_${numId}_${provId}_${opId}_${price}`)],
            [Markup.button.callback('❌ BATAL', 'start_menu')]
        ])
    });
});

// --- 6. STEP: EKSEKUSI ORDER ---
bot.action(/^buy_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, opId, price] = ctx.match;
    const userId = ctx.from.id;

    try {
        await ctx.answerCbQuery('⏳ Memproses...', { show_alert: false });

        const user = await User.findOne({ telegramId: userId });
        if (!user || user.saldo < parseInt(price)) {
            return ctx.reply('❌ Saldo Anda tidak cukup!');
        }

        const url = `/v2/orders?number_id=${numId}&provider_id=${provId}&operator_id=${opId}`;
        const orderRes = await roApi.get(url);
        
        if (orderRes.data.success) {
            const order = orderRes.data.data;
            
            user.saldo -= parseInt(price);
            await user.save();

            const successMsg = `✅ *NOMOR DIDAPATKAN!*\n━━━━━━━━━━━━━━━━━━\n` +
                               `📞 Nomor: \`${order.phone_number}\`\n` +
                               `🆔 Order ID: \`${order.order_id}\`\n` +
                               `💰 Harga: Rp ${parseInt(price).toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━━━━`;

            await ctx.reply(successMsg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 CEK OTP', `status_${order.order_id}`)],
                    [Markup.button.callback('❌ REFUND & CANCEL', `cncl_${order.order_id}_${price}`)]
                ])
            });
        } else {
            ctx.reply(`❌ Gagal: ${orderRes.data.message}`);
        }
    } catch (e) {
        ctx.reply('❌ Sistem error saat beli.');
    }
});

// --- 7. STEP: CEK OTP ---
bot.action(/^status_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    try {
        const res = await roApi.get(`/v1/orders/get_status?order_id=${orderId}`);
        const data = res.data.data;

        if (data.otp_code) {
            await ctx.reply(`📩 *OTP DITERIMA!*\n\nKode: \`${data.otp_code}\`\nPesan: \`${data.otp_msg}\``, { parse_mode: 'Markdown' });
        } else {
            await ctx.answerCbQuery('Belum ada OTP. Tunggu sebentar lagi!', { show_alert: true });
        }
    } catch (e) { ctx.answerCbQuery('Gagal cek status.'); }
});

// --- 8. STEP: CANCEL & REFUND (SANGAT PENTING) ---
bot.action(/^cncl_(.+)_(.+)$/, async (ctx) => {
    const [_, orderId, price] = ctx.match;
    const userId = ctx.from.id;

    try {
        await ctx.answerCbQuery('Memproses Refund...');
        // 1. Tembak API RumahOTP untuk cancel
        const res = await roApi.get(`/v1/orders/cancel?order_id=${orderId}`);
        
        if (res.data.success) {
            // 2. Kembalikan saldo di database
            const user = await User.findOne({ telegramId: userId });
            user.saldo += parseInt(price);
            await user.save();

            await ctx.editMessageCaption(`✅ *PESANAN DIBATALKAN*\nSaldo Rp ${price} telah dikembalikan ke akun Manzzy ID Anda.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Utama', 'start_menu')]])
            });
        } else {
            ctx.reply('❌ Gagal membatalkan. Mungkin nomor sudah ditarik atau sudah dapet OTP.');
        }
    } catch (e) {
        ctx.reply('❌ Error saat proses refund.');
    }
});


// --- 4. RUN BOT ---
bot.launch().then(() => {
  console.log('🚀 Bot Manzzy ID sudah online!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));