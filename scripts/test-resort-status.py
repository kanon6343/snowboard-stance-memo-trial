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

if __name__=='__main__':unittest.main()
