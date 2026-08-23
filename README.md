# dsh-discord-richpresence

> **English**: [README.en.md](README.en.md)

涓€涓?[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 鎻掍欢锛屽皢浣犱笌 dsh 鐨勪氦浜掔姸鎬?*瀹炴椂**闀滃儚鍒?*鏈湴 Discord 瀹㈡埛绔?*鐨?Rich Presence 涓娾€斺€旇€屼笖鍙細鎺ㄩ€?*妯＄硦鐨勩€佸彲鑷畾涔夌殑鐘舵€佹枃妗?*銆?
杩欐槸涓€涓涓讳晶鍚庡彴鎻掍欢锛氭棤鎵樼洏鍥炬爣銆佹棤鐣岄潰銆佹棤绐楀彛銆傚畨瑁呭悗鍗虫敞鍏ュ埌 dsh 鐨勫惎鍔ㄦ祦绋嬩腑锛岄殢 dsh 涓€璧峰父椹昏繍琛屻€?
## 瀹冭兘鍋氫粈涔?
鎻掍欢鐩戝惉杩愯涓?dsh 鐨勭矖绮掑害娲诲姩淇″彿锛?
| dsh 淇″彿 | 鐘舵€佺ず渚嬶紙榛樿锛?|
| --- | --- |
| 鐢ㄦ埛娑堟伅杩涘叆 agent 鏀朵欢绠?| 姝ｅ湪鎸囨尌澶ц偉楸煎共娲?/ 姝ｅ湪缁欏ぇ鑲ラ奔鍠?token |
| agent 姝ｅ湪杩愯锛堟€濊€?/ 娴佸紡杈撳嚭锛?| 姝ｅ湪涓庡ぇ鑲ラ奔涓€璧?Brainstorming / 姝ｅ湪鍚ぇ鑲ラ奔璁茶В Project |
| 妯″瀷宸ュ叿姝ｅ湪鎵ц | 姝ｅ湪鎻愪氦鏀瑰姩鎰忚 |
| 鍒涘缓浜嗘柊浼氳瘽 / 鍒嗘敮锛堝垎鏀璇濓級 | 姝ｅ湪鍒涘缓澶ц偉楸艰蹇嗗垏鐗?|
| 鏃犳椿鍔?| 澶ц偉楸煎緟鍛?|

涓婇潰姣忎竴琛岄兘鏄彃浠堕厤缃紙`statuses`锛変腑**鍙洿鎺ョ紪杈戠殑鍒楄〃**銆傛彃浠跺彧浼氭妸杩欎簺瀛楃涓插師鏍峰彂缁?Discord銆?
## 涓板瘜妯″紡锛堝彲閫夛級

榛樿鎯呭喌涓嬶紝鎻掍欢鍙帹閫佷笂闈㈢殑妯＄硦鐘舵€併€傚湪**璁剧疆 鈫?閫氱敤璁剧疆 鈫?Rich Presence 涓板瘜鐘舵€?*閲屽彲浠ユ墦寮€**涓板瘜妯″紡**銆傚紑鍚悗锛屾彃浠舵敼涓烘帹閫佹洿鏅鸿兘銆佸甫瀹炴椂鏁版嵁鐨勭姸鎬佽锛?
| 瀹炴椂鏁版嵁 | 鐘舵€佺ず渚?|
| --- | --- |
| 浣犲垰鍙戦€佷簡娑堟伅 | 姝ｅ湪鎸囧澶ц偉楸?|
| agent 姝ｅ湪鎬濊€?| 澶ц偉楸兼鍦ㄦ€濊€?6/195 |
| 鎬昏緭鍏?tokens | 澶ц偉楸兼鍦ㄨ绗旇 38.7M |
| LLM 宸叉€濊€冩椂闀?| 澶ц偉楸煎凡缁忔€濊€冧簡 30m46s |

涓板瘜妯″紡鐨勭姸鎬佹槸**鏅鸿兘闅忔満**鍦颁粠褰撳墠瀹炴椂鏁版嵁涓寫閫夌殑鈥斺€斿苟涓嶇粦瀹氭煇涓壒瀹氭椂鍒烩€斺€斿苟涓?*姣忎釜鐘舵€佸湪 Discord 涓婅嚦灏戝睍绀?8 绉?*銆傝寮€鍏宠繍琛屾椂鎸佷箙鍖栧湪 `discord-richpresence` 璁剧疆鍛藉悕绌洪棿涓紝鏃犻渶鍦?patch 閲岄厤缃€?
## 闅愮

**鎻掍欢缁濅笉璇诲彇浣犵殑宸ヤ綔鍖哄唴瀹广€?* 瀹冧笉浼氭煡鐪嬩細璇濇爣棰樸€佹秷鎭鏂囥€佹枃浠惰矾寰勩€佸伐鍏疯緭鍏ヨ緭鍑烘垨浠讳綍鍏朵粬鍐呭锛屽彧鍝嶅簲绮楃矑搴︾殑鐢熷懡鍛ㄦ湡淇″彿锛坄agent/inbox/inserted`銆乣agent/status`銆乣agent/pre-step`銆乣tools/pre-execute`銆乣session/created`銆乣workflow/start`锛夛紝鐒跺悗鎺ㄩ€侀厤缃ソ鐨勭姸鎬佸瓧绗︿覆锛堟垨涓婇潰閭ｄ簺鍙～鍏ユ爣閲忔暟鎹殑涓板瘜妯℃澘鈥斺€斾笉鍚换浣曞唴瀹癸級銆傚嵆浣夸繚鎸侀粯璁ゅ垪琛紝Discord 涓婁篃鍙細鍑虹幇"姝ｅ湪鎸囨尌澶ц偉楸煎共娲?杩欐牱鐨勬ā绯婄姸鎬併€?
## 鐜瑕佹眰

- 鏈満杩愯鐫€ **Discord 妗岄潰瀹㈡埛绔?*锛圧ich Presence 璧版湰鍦?Discord IPC 绔偣鈥斺€擶indows 涓婃槸鍛藉悕绠￠亾锛宮acOS/Linux 涓婃槸 unix socket锛屾垨鍥炵幆 TCP锛夈€?
Discord Application ID 宸查缃湪鎻掍欢涓紝鏃犻渶浠讳綍閰嶇疆鈥斺€斿畨瑁呭苟閲嶅惎鍚庯紝鐘舵€佸氨浼氳嚜鍔ㄥ嚭鐜板湪浣犵殑 Discord 涓汉璧勬枡涓娿€?
## 瀹夎

浠撳簱锛?https://github.com/0QwQ0/dsh-discord-richpresence>
鍙戝竷鍖咃細<https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz>

鍦?dsh 妫€鍑虹洰褰?/ profile 涓嬫墽琛岋細

```sh
dsh plugin --profile web add https://github.com/0QwQ0/dsh-discord-richpresence/releases/latest/download/dsh-discord-richpresence-0.2.1.tgz
```

濡傛灉鍖呭凡鍦ㄦ湰鍦扮鐩樹笂锛堜緥濡傛湰浠撳簱锛夛細

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-discord-richpresence
```

## 閰嶇疆

鎵€鏈夐厤缃兘浣嶄簬 bundle patch锛坄cordis.patch.yml`锛夌殑 `config` 涓嬶細

```yaml
config:
  clientId: '1540732930127691807'         # 宸查缃紝閫氬父鏃犻渶淇敼
  details: 'DeepSeek Harness'             # 鍙€夛細绗簩琛屾枃瀛?  largeImage: ''                          # 鍙€夛細Discord 澶у浘璧勪骇 key
  statuses:                               # 鍙紪杈戠殑鐘舵€佸垪琛紝鎸夐樁娈靛垎缁?    userInput:
      - 姝ｅ湪鎸囨尌澶ц偉楸煎共娲?      - 姝ｅ湪缁欏ぇ鑲ラ奔鍠?token
    agentWorking:
      - 姝ｅ湪涓庡ぇ鑲ラ奔涓€璧?Brainstorming
      - 姝ｅ湪鍚ぇ鑲ラ奔璁茶В Project
    tools:
      - 姝ｅ湪鎻愪氦鏀瑰姩鎰忚
    forking:
      - 姝ｅ湪鍒涘缓澶ц偉楸艰蹇嗗垏鐗?    idle:
      - 澶ц偉楸煎緟鍛?  randomize: false                        # true 鏃堕殢鏈洪€夊彇锛屽惁鍒欒疆娴?  minIntervalMs: 5000                     # 涓ゆ鎺ㄩ€佷箣闂寸殑鏈€灏忛棿闅?  reconnectMs: 15000                      # Discord 鏂嚎閲嶈繛鐨勮疆璇㈤棿闅?```

- `statuses` 鈥?姣忎釜闃舵閮芥槸涓€涓垪琛紱鎻掍欢鎸夐『搴忚疆娴侀€夊彇锛坄randomize: true` 鏃堕殢鏈猴級銆傚彲浠ヨ嚜鐢卞鍒犮€佹敼鍐欍€?- Discord 鍙嶆槧鐘舵€佸彉鍖栧彲鑳芥湁鍑犵寤惰繜锛沗minIntervalMs` 鐢ㄤ簬闄愬埗鎺ㄩ€侀鐜囥€?- 涓板瘜妯″紡寮€鍏?*涓嶅睘浜?patch**鈥斺€斿畠鍦ㄨ缃?鈫?閫氱敤璁剧疆涓紝杩愯鏃舵寔涔呭寲銆?
## 鍗歌浇

```sh
dsh plugin --profile web remove dsh-discord-richpresence
```

## 宸ヤ綔鍘熺悊

- `lib/discord-rpc.js` 鈥?闆朵緷璧栫殑 Discord Rich Presence 瀹㈡埛绔紝鍩轰簬鏈湴 IPC 甯у崗璁紙鐢?`client_id` 鎻℃墜锛岀劧鍚庡彂閫?`SET_ACTIVITY` 甯э紱鍚?ping/pong 淇濇椿涓庤嚜鍔ㄩ噸杩烇級銆?- `lib/index.js` 鈥?Cordis 瀹夸富鎻掍欢銆傛敞鍐岀矖绮掑害瀹夸富浜嬩欢鐨勫叏灞€鐩戝惉鍣紝鏄犲皠鍒伴厤缃ソ鐨勭姸鎬佸垪琛紙鎴栦赴瀵屾ā寮忔ā鏉匡級锛屽啀閫氳繃 RPC 瀹㈡埛绔帹閫併€備赴瀵屾ā寮忚鍙?`discord-richpresence` 璁剧疆鍛藉悕绌洪棿锛涙彃浠剁氦缁村嵏杞芥椂浼氭竻鐞嗘墍鏈夊畾鏃跺櫒骞跺叧闂?socket銆?- `lib/client.js` 鈥?娴忚鍣ㄥ崐閮ㄣ€傛敞鍐岃缃?鈫?閫氱敤璁剧疆閲岀殑鍒囨崲琛岋紝鍐欏叆 `discord-richpresence` 璁剧疆鍛藉悕绌洪棿鐨?`richMode` 瀛楁銆?
## 璁稿彲璇?
MIT
