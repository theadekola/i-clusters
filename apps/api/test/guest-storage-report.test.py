"""Read-only compatibility check against installed LVM tools, not a resize test."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('guest_storage', Path(__file__).resolve().parents[1] / 'src/agent-assets/guest-storage.py')
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)


class LVMReports(unittest.TestCase):
    def test_actual_logical_volume_segment_report(self):
        rows = guest.rows(['lvs', '--segments', '--reportformat', 'json', '--units', 'b', '--nosuffix', '-o', 'lv_path,lv_uuid,vg_name,lv_size,segtype'], 'seg')
        self.assertIsInstance(rows, list)
        for row in rows:
            self.assertTrue({'lv_path', 'lv_uuid', 'vg_name', 'lv_size', 'segtype'} <= row.keys())

    def test_actual_physical_volume_report(self):
        rows = guest.rows(['pvs', '--reportformat', 'json', '--units', 'b', '--nosuffix', '-o', 'pv_name,pv_uuid,vg_name,pv_size,pv_free'], 'pv')
        self.assertIsInstance(rows, list)
        for row in rows:
            self.assertTrue({'pv_name', 'pv_uuid', 'vg_name', 'pv_size', 'pv_free'} <= row.keys())


if __name__ == '__main__':
    unittest.main()
