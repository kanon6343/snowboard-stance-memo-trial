"""Synthetic parser checks. Real website HTML is not redistributed in this repository."""
import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('collect-resort-status.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StatusTests(unittest.TestCase):
    def test_happo_lift_icons(self):
        raw='<p>2026.11.19 08:15 更新</p><table><tr><th>リフト名</th></tr><tr><td>架空リフト</td><td><img alt="○"><img alt="○"></td><td>8:00</td></tr></table>'
        value=m.parse(raw,'happo','lifts');self.assertEqual(value['items'][0]['status'],'open');self.assertEqual(value['sourceUpdatedAt'],'2026-11-19T08:15+09:00')
    def test_happo_course_letter_is_not_name(self):
        raw='<table><tr><th>コース・ゲレンデ名</th></tr><tr><td>A</td><td>架空コース</td><td><img alt="Ｘ"></td></tr></table>'
        value=m.parse(raw,'happo','courses');self.assertEqual(value['items'][0]['name'],'架空コース');self.assertEqual(value['items'][0]['status'],'closed');self.assertIsNone(value['sourceUpdatedAt'])
    def test_marunuma_uses_today_not_tomorrow(self):
        raw='<table><tr><th>コース名</th></tr><tr><th>架空コース</th><td>中級</td><td>×</td><td>○</td><td>営業前</td></tr></table>'
        self.assertEqual(m.parse(raw,'marunuma','courses')['items'][0]['status'],'closed')
    def test_kiroro_excludes_course_specs(self):
        raw='<p>Lift and Trail Status 2026/11/19 08:10</p><table><tr><td>架空リフト</td><td>SUSPENDED</td></tr></table><table><tr><td>架空コース</td><td>クローズ</td></tr></table><table><tr><td>架空ツリー</td><td>OPEN</td></tr></table><table><tr><td>距離</td><td>1000m</td></tr></table>'
        self.assertEqual(len(m.parse(raw,'kiroro','courses')['items']),1);self.assertEqual(m.parse(raw,'kiroro','lifts')['items'][0]['status'],'limited')
    def test_no_status_is_not_all_closed(self):
        for adapter in ['happo','marunuma','kiroro']:
            with self.subTest(adapter=adapter):
                with self.assertRaises(ValueError):m.parse('<p>通信エラー</p>',adapter,'lifts')
    def test_unknown_is_unknown(self):self.assertEqual(m.state('新しい状態'),'unknown')
    def test_bad_date_is_unknown(self):
        raw='<p>2026.99.99 88:99 更新</p><table><tr><th>リフト名</th></tr><tr><td>架空リフト</td><td>不明</td><td></td></tr></table>'
        self.assertIsNone(m.parse(raw,'happo','lifts')['sourceUpdatedAt'])
    def test_duplicate_rows_fail_closed(self):
        raw='<table><tr><td>架空</td><td>OPEN</td></tr><tr><td>架空</td><td>OPEN</td></tr></table><table><tr><td>コース</td><td>クローズ</td></tr></table>'
        with self.assertRaises(ValueError):m.parse(raw,'kiroro','lifts')

    def test_hirafu_uses_one_language_and_not_snow_timestamp(self):
        raw='<time datetime="2026-11-19T08:00">snow date</time><div class="p-status__lifts"><div class="p-status__lift"><h4 class="p-status__lift-name">架空リフト</h4><div class="p-status__lift-status">運休/閉鎖中</div></div></div><div class="p-status__lifts"><div class="p-status__lift"><h4 class="p-status__lift-name">Translated lift</h4><div class="p-status__lift-status">Operating</div></div></div>'
        parsed=m.parse(raw,'hirafu','lifts');self.assertEqual(len(parsed['items']),1);self.assertEqual(parsed['items'][0]['status'],'closed');self.assertIsNone(parsed['sourceUpdatedAt'])
    def test_hirafu_course_status_is_not_difficulty(self):
        raw='<div class="p-status__courses"><div class="p-status__course-item"><p class="p-status__course-name">架空コース</p><p class="p-status__course-state">クローズ</p><p>初級</p></div></div>'
        self.assertEqual(m.parse(raw,'hirafu','courses')['items'][0]['status'],'closed')
    def test_rusutsu_public_json_keeps_real_update(self):
        import json
        raw=json.dumps({'other':{'update':'1775084662'},'lift':[{'nm':'架空リフト','stat':'運転中'}],'trail':{'a':[{'nm':'架空コース','stat':'クローズ'}]}})
        self.assertEqual(m.parse(raw,'rusutsu','lifts')['items'][0]['status'],'open');self.assertTrue(m.parse(raw,'rusutsu','courses')['sourceUpdatedAt'].startswith('2026-04-01'))
    def test_rusutsu_unknown_is_not_open(self):
        import json
        raw=json.dumps({'other':{'update':'bad'},'lift':[{'nm':'架空','stat':'未定義の状態'}]})
        value=m.parse(raw,'rusutsu','lifts');self.assertEqual(value['items'][0]['status'],'unknown');self.assertIsNone(value['sourceUpdatedAt'])
    def test_okuibuki_is_a_plan_and_empty_marker_is_unknown(self):
        raw='<section class="lcl-lift"><p>2026/11/19 のリフト運行予定 （2026/11/18 17:00 更新）</p><li class="lcl-course-list__item"><h4 class="lcl-course__ttl">架空A</h4><span class="lcl-course__mark"></span></li><li class="lcl-course-list__item"><h4 class="lcl-course__ttl">架空B</h4><p>8:00〜17:00</p></li></section>'
        value=m.parse(raw,'okuibuki','lifts');self.assertEqual(value['mode'],'planned');self.assertEqual(value['targetDate'],'2026-11-19');self.assertEqual(value['items'][0]['status'],'open');self.assertEqual(value['items'][1]['status'],'unknown')
    def test_okuibuki_preparing_is_not_open(self):
        raw='<section class="lcl-open-course"><li class="lcl-course-list__item"><h4 class="lcl-course__ttl">架空</h4><span class="lcl-course__prep">準備中</span></li></section>'
        self.assertEqual(m.parse(raw,'okuibuki','courses')['items'][0]['status'],'closed')
    def test_charmant_does_not_count_table_without_status(self):
        raw='<p>2026/11/19 08:00 更新</p><table><tr><th>コース名</th><th>レベル</th><th>状況</th></tr><tr><td>架空A</td><td>中級</td><td>✕</td></tr></table><table><tr><th>コース名</th><th>レベル</th></tr><tr><td>架空B</td><td>上級</td></tr></table>'
        value=m.parse(raw,'charmant','courses');self.assertEqual(len(value['items']),1);self.assertEqual(value['items'][0]['status'],'closed')
    def test_new_adapters_missing_markup_fail(self):
        for adapter in ['hirafu','okuibuki','charmant','rusutsu']:
            with self.subTest(adapter=adapter):
                with self.assertRaises((ValueError,KeyError,TypeError)):m.parse('<p>no status</p>',adapter,'lifts')


if __name__=='__main__':unittest.main()
