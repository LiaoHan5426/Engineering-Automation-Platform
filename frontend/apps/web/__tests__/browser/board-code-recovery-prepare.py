"""Opt-in deterministic browser data. Requires the owned isolated workspace; never invokes a model."""
from pathlib import Path
import subprocess,sys,os,shutil,xml.etree.ElementTree as ET
if os.environ.get('EAP_RUN_BOARD_CODE_BROWSER')!='approved':raise SystemExit('Set EAP_RUN_BOARD_CODE_BROWSER=approved to create the bounded local browser fixture')
root=Path(__file__).resolve().parents[5]
reports=list((root/'backend').glob('**/target/surefire-reports/TEST-com.lh.eap.persistence.mapper.BoardCodeProposalRecoveryTest.xml'))
if len(reports)!=1:raise SystemExit('Run the focused BoardCodeProposalRecoveryTest first to establish the local runtime classpath')
xml=ET.parse(reports[0]).getroot();cp=next(p.attrib['value'] for p in xml.findall('properties/property') if p.attrib['name']=='java.class.path')
java=Path(shutil.which('java'));javac=java.with_name('javac.exe' if os.name=='nt' else 'javac')
source=root/'backend/eap-applications/eap-full-application/src/test/java/com/lh/eap/persistence/mapper/BoardCodeRecoveryBrowserFixture.java'
classes=root/'backend/target/board-code-browser-classes';classes.mkdir(exist_ok=True)
r=subprocess.run([str(javac),'-encoding','UTF-8','-cp',cp,'-d',str(classes),str(source)],cwd=root)
if r.returncode:sys.exit(r.returncode)
sys.exit(subprocess.run([str(java),'-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',str(classes)+os.pathsep+cp,'com.lh.eap.persistence.mapper.BoardCodeRecoveryBrowserFixture'],cwd=root).returncode)
